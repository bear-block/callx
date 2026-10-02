package dev.callx.livekit

import android.Manifest
import android.app.Activity
import android.app.Application
import android.content.Context
import android.content.pm.PackageManager
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.ViewGroup
import android.widget.FrameLayout
import dev.callx.core.CameraFacing
import dev.callx.core.LocalVideo
import dev.callx.telecom.CallxCameraError
import dev.callx.telecom.CallxMediaSink
import dev.callx.telecom.CallxVideoAdapter
import dev.callx.telecom.CallxVideoSurface
import dev.callx.telecom.VideoSource
import io.livekit.android.AudioOptions
import io.livekit.android.LiveKit
import io.livekit.android.LiveKitOverrides
import io.livekit.android.audio.NoAudioHandler
import io.livekit.android.events.RoomEvent
import io.livekit.android.events.collect
import io.livekit.android.renderer.TextureViewRenderer
import io.livekit.android.room.Room
import io.livekit.android.room.track.AudioTrack
import io.livekit.android.room.track.CameraPosition
import io.livekit.android.room.track.LocalVideoTrack
import io.livekit.android.room.track.Track
import io.livekit.android.room.track.VideoTrack
import java.util.concurrent.ConcurrentHashMap
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Job
import kotlinx.coroutines.job
import kotlinx.coroutines.launch
import livekit.org.webrtc.RendererCommon

/**
 * LiveKit media adapter: one LiveKit room per call, joined when the call is answered and left when
 * it ends. It follows ADR-0004: Telecom owns routing, so LiveKit's own route manager
 * (AudioSwitch) is replaced with [NoAudioHandler], and LiveKit plays on the voice-call stream.
 * It implements [CallxVideoAdapter] (ADR-0009, ADR-0010): the ingress starts and stops it, it
 * reports readiness, drops and video through the call's sink, never a call end, and it renders
 * video into the surfaces `CallxVideoView` attaches, with a TextureView so Flutter can show it.
 */
class LiveKitMediaAdapter(
    context: Context,
    private val scope: CoroutineScope,
    private val credentials: suspend (callId: String) -> LiveKitCredentials,
    private val log: (String) -> Unit,
) : CallxVideoAdapter {
    private val context = context.applicationContext
    private val main = Handler(Looper.getMainLooper())
    private class Session(val job: Job, val sink: CallxMediaSink) {
        @Volatile var room: Room? = null
        @Volatile var muted = false
        /** Remote audio tracks this device currently hears. */
        val hearing: MutableSet<Track> = ConcurrentHashMap.newKeySet()
        /** The remote video shown in remote surfaces: the first subscribed video track. */
        @Volatile var remoteVideo: VideoTrack? = null
        /** The local camera while it is published. */
        @Volatile var localVideo: LocalVideoTrack? = null
        /** The camera was on when the app went to the background, so it comes back in front. */
        @Volatile var cameraPaused = false
    }
    private val sessions = ConcurrentHashMap<String, Session>()

    /** A surface and the renderer this adapter added to it. Main thread only. */
    private class Binding(val callId: String, val source: VideoSource, val surface: CallxVideoSurface) {
        var renderer: TextureViewRenderer? = null
        var track: VideoTrack? = null
    }
    private val bindings = LinkedHashMap<CallxVideoSurface, Binding>()

    init {
        (this.context as? Application)?.registerActivityLifecycleCallbacks(Foreground())
    }

    /** Joins the call's room. Returns at once; idempotent per call. */
    override fun start(callId: String, sink: CallxMediaSink) {
        if (sessions.containsKey(callId)) return
        lateinit var session: Session
        session = Session(scope.launch(start = CoroutineStart.LAZY) {
            val room = LiveKit.create(context, overrides = LiveKitOverrides(
                audioOptions = AudioOptions(audioHandler = NoAudioHandler())))
            session.room = room
            // The job lives until stop() cancels it (the event collector never returns).
            coroutineContext.job.invokeOnCompletion {
                session.localVideo = null; session.remoteVideo = null
                main.post { refresh(callId); room.release() }
            }
            try {
                val (url, token) = credentials(callId)
                launch {
                    room.events.collect { event ->
                        when (event) {
                            is RoomEvent.TrackSubscribed -> when (val track = event.track) {
                                is AudioTrack -> {
                                    session.hearing += track
                                    log("media connected (LiveKit) for $callId: hearing ${event.participant.identity?.value}")
                                    session.sink.connected()
                                }
                                is VideoTrack -> if (session.remoteVideo == null) {
                                    session.remoteVideo = track
                                    log("media: remote video for $callId from ${event.participant.identity?.value}")
                                    session.sink.videoChanged(remoteVideo = true); main.post { refresh(callId) }
                                }
                                else -> Unit
                            }
                            is RoomEvent.TrackUnsubscribed -> when (val track = event.track) {
                                is AudioTrack -> {
                                    session.hearing -= track
                                    if (session.hearing.isEmpty()) {
                                        log("media interrupted for $callId: ${event.participant.identity?.value} is no longer heard")
                                        session.sink.interrupted()
                                    }
                                }
                                is VideoTrack -> if (session.remoteVideo === track) {
                                    session.remoteVideo = null
                                    log("media: remote video for $callId stopped")
                                    session.sink.videoChanged(remoteVideo = false); main.post { refresh(callId) }
                                }
                                else -> Unit
                            }
                            is RoomEvent.Reconnecting -> {
                                log("media interrupted for $callId: LiveKit is reconnecting"); session.sink.interrupted()
                            }
                            is RoomEvent.Reconnected -> if (session.hearing.isNotEmpty()) {
                                log("media connected (LiveKit) for $callId: reconnected"); session.sink.connected()
                            }
                            is RoomEvent.ParticipantDisconnected ->
                                log("media: ${event.participant.identity?.value} left the room of $callId")
                            is RoomEvent.Disconnected -> {
                                // stop() also disconnects; only a drop while the call is live counts.
                                log("media: left the room of $callId (${event.reason})")
                                if (sessions[callId] === session) session.sink.interrupted()
                            }
                            else -> Unit
                        }
                    }
                }
                room.connect(url, token)
                log("media: joined the room of $callId")
                enableMicrophone(callId, room, !session.muted)
            } catch (error: Throwable) {
                // WebRTC reports some device failures as Errors; media must never crash the app.
                if (error is kotlinx.coroutines.CancellationException) throw error
                log("media failed for $callId: $error")
            }
        }, sink)
        if (sessions.putIfAbsent(callId, session) == null) session.job.start()
    }

    /** Leaves the call's room and releases LiveKit's resources. */
    override fun stop(callId: String) {
        val session = sessions.remove(callId) ?: return
        session.job.cancel()
    }

    /** Mute from the app or from another Telecom surface. Before joining, applies on join. */
    override suspend fun setMuted(callId: String, muted: Boolean): Boolean {
        val session = sessions[callId] ?: return false
        session.muted = muted
        val room = session.room ?: return true
        return enableMicrophone(callId, room, !muted)
    }

    /** Publishes, switches or stops the camera. The core already checked that the app is in front. */
    override suspend fun setCamera(callId: String, on: Boolean, facing: CameraFacing): CallxCameraError? {
        val session = sessions[callId] ?: return CallxCameraError.mediaNotReady
        val room = session.room ?: return CallxCameraError.mediaNotReady
        val position = if (facing == CameraFacing.back) CameraPosition.BACK else CameraPosition.FRONT
        if (on && context.checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            log("media: no camera permission for $callId"); return CallxCameraError.permissionDenied
        }
        return try {
            val current = session.localVideo
            when {
                on && current != null -> current.switchCamera(position = position)
                on -> {
                    room.videoTrackCaptureDefaults = room.videoTrackCaptureDefaults.copy(position = position)
                    if (!room.localParticipant.setCameraEnabled(true)) return CallxCameraError.platformRejected
                    session.localVideo = room.localParticipant.getTrackPublication(Track.Source.CAMERA)?.track as? LocalVideoTrack
                }
                else -> {
                    room.localParticipant.setCameraEnabled(false)
                    session.localVideo = null; session.cameraPaused = false
                }
            }
            log("media: camera ${if (on) "on ($facing)" else "off"} for $callId")
            main.post { refresh(callId) }
            null
        } catch (error: Throwable) {
            if (error is kotlinx.coroutines.CancellationException) throw error
            log("media: camera failed for $callId: $error"); CallxCameraError.platformRejected
        }
    }

    override fun attach(callId: String, source: VideoSource, surface: CallxVideoSurface) {
        detach(callId, surface)
        bindings[surface] = Binding(callId, source, surface)
        refresh(callId)
    }

    override fun detach(callId: String, surface: CallxVideoSurface) {
        val binding = bindings.remove(surface) ?: return
        unbind(binding)
    }

    /** Puts each surface of [callId] in step with the tracks it should show. Main thread. */
    private fun refresh(callId: String) {
        val session = sessions[callId]
        for (binding in bindings.values.filter { it.callId == callId }) {
            val room = session?.room
            val track = when (binding.source) {
                VideoSource.local -> session?.localVideo
                VideoSource.remote -> session?.remoteVideo
            }
            if (track === binding.track && (track == null || binding.renderer != null)) continue
            binding.track?.let { old -> binding.renderer?.let(old::removeRenderer) }
            binding.track = null
            if (track == null || room == null) continue
            val renderer = binding.renderer ?: TextureViewRenderer(binding.surface.container.context).also { view ->
                room.initVideoRenderer(view)
                view.setMirror(binding.surface.mirror)
                view.setScalingType(if (binding.surface.fit == CallxVideoSurface.Fit.contain)
                    RendererCommon.ScalingType.SCALE_ASPECT_FIT else RendererCommon.ScalingType.SCALE_ASPECT_FILL)
                binding.surface.container.addView(view, FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
                binding.renderer = view
            }
            track.addRenderer(renderer)
            binding.track = track
        }
    }

    private fun unbind(binding: Binding) {
        binding.renderer?.let { renderer ->
            binding.track?.removeRenderer(renderer)
            binding.surface.container.removeView(renderer)
            renderer.release()
        }
        binding.renderer = null; binding.track = null
    }

    /**
     * Android stops the camera of an app in the background, so pause it there and report it
     * blocked, then resume it when the app is back in front (ADR-0010).
     */
    private inner class Foreground : Application.ActivityLifecycleCallbacks {
        private var started = 0
        override fun onActivityStarted(activity: Activity) {
            if (started++ > 0) return
            for ((callId, session) in sessions) {
                val track = session.localVideo ?: continue
                if (!session.cameraPaused) continue
                session.cameraPaused = false
                runCatching { track.startCapture() }.onFailure { log("media: camera did not resume for $callId: $it") }
                    .onSuccess { log("media: camera resumed for $callId"); session.sink.videoChanged(localVideo = LocalVideo.on) }
            }
        }
        override fun onActivityStopped(activity: Activity) {
            if (--started > 0) return
            for ((callId, session) in sessions) {
                val track = session.localVideo ?: continue
                session.cameraPaused = true
                runCatching { track.stopCapture() }
                log("media: camera paused for $callId in the background")
                session.sink.videoChanged(localVideo = LocalVideo.blocked)
            }
        }
        override fun onActivityCreated(activity: Activity, savedInstanceState: Bundle?) {}
        override fun onActivityResumed(activity: Activity) {}
        override fun onActivityPaused(activity: Activity) {}
        override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) {}
        override fun onActivityDestroyed(activity: Activity) {}
    }

    /**
     * Without RECORD_AUDIO Android refuses the microphone and WebRTC throws an AssertionError, so
     * check first: the call stays connected and this device only listens.
     */
    private suspend fun enableMicrophone(callId: String, room: Room, enabled: Boolean): Boolean {
        if (enabled && context.checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            log("media: no microphone permission for $callId; listening only. Grant it before the next call.")
            return false
        }
        return try {
            room.localParticipant.setMicrophoneEnabled(enabled)
            log("media: microphone ${if (enabled) "on" else "muted"} for $callId"); true
        } catch (error: Throwable) {
            if (error is kotlinx.coroutines.CancellationException) throw error
            log("media: microphone failed for $callId: $error"); false
        }
    }
}
