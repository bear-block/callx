package dev.callx.preview.rn.device

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import dev.callx.telecom.MediaMuteController
import io.livekit.android.AudioOptions
import io.livekit.android.LiveKit
import io.livekit.android.LiveKitOverrides
import io.livekit.android.audio.NoAudioHandler
import io.livekit.android.events.RoomEvent
import io.livekit.android.events.collect
import io.livekit.android.room.Room
import io.livekit.android.room.track.AudioTrack
import io.livekit.android.room.track.Track
import java.util.concurrent.ConcurrentHashMap
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Job
import kotlinx.coroutines.job
import kotlinx.coroutines.launch

/** Where and as whom a call's media connects. A real app gets this from its backend. */
data class MediaCredentials(val url: String, val token: String)

/**
 * Example media adapter: one LiveKit room per call, joined when the call is answered and left when
 * it ends. It follows ADR-0004: Telecom owns routing, so LiveKit's own route manager
 * (AudioSwitch) is replaced with [NoAudioHandler], and LiveKit plays on the voice-call stream.
 * Media never decides the call's state: it reports readiness through [onConnected] and drops
 * through [onInterrupted] (LiveKit reconnecting, or no remote audio left), never a call end.
 */
class LiveKitCallMedia(
    context: Context,
    private val scope: CoroutineScope,
    private val credentials: suspend (callId: String) -> MediaCredentials,
    /** The remote party's audio is subscribed: report `mediaConnected`. */
    private val onConnected: (callId: String) -> Unit,
    /** Connected media dropped: report `mediaInterrupted`. [onConnected] follows when it is back. */
    private val onInterrupted: (callId: String) -> Unit,
    private val log: (String) -> Unit,
) : MediaMuteController {
    private val context = context.applicationContext
    private class Session(val job: Job) {
        @Volatile var room: Room? = null
        @Volatile var muted = false
        /** Remote audio tracks this device currently hears. */
        val hearing: MutableSet<Track> = ConcurrentHashMap.newKeySet()
    }
    private val sessions = ConcurrentHashMap<String, Session>()

    /** Joins the call's room. Returns at once; idempotent per call. */
    fun start(callId: String) {
        if (sessions.containsKey(callId)) return
        lateinit var session: Session
        session = Session(scope.launch(start = CoroutineStart.LAZY) {
            val room = LiveKit.create(context, overrides = LiveKitOverrides(
                audioOptions = AudioOptions(audioHandler = NoAudioHandler())))
            session.room = room
            // The job lives until stop() cancels it (the event collector never returns).
            coroutineContext.job.invokeOnCompletion { room.release() }
            try {
                val (url, token) = credentials(callId)
                launch {
                    room.events.collect { event ->
                        when (event) {
                            is RoomEvent.TrackSubscribed -> if (event.track is AudioTrack) {
                                session.hearing += event.track
                                log("media connected (LiveKit) for $callId: hearing ${event.participant.identity?.value}")
                                onConnected(callId)
                            }
                            is RoomEvent.TrackUnsubscribed -> if (event.track is AudioTrack) {
                                session.hearing -= event.track
                                if (session.hearing.isEmpty()) {
                                    log("media interrupted for $callId: ${event.participant.identity?.value} is no longer heard")
                                    onInterrupted(callId)
                                }
                            }
                            is RoomEvent.Reconnecting -> {
                                log("media interrupted for $callId: LiveKit is reconnecting"); onInterrupted(callId)
                            }
                            is RoomEvent.Reconnected -> if (session.hearing.isNotEmpty()) {
                                log("media connected (LiveKit) for $callId: reconnected"); onConnected(callId)
                            }
                            is RoomEvent.ParticipantDisconnected ->
                                log("media: ${event.participant.identity?.value} left the room of $callId")
                            is RoomEvent.Disconnected -> {
                                // stop() also disconnects; only a drop while the call is live counts.
                                log("media: left the room of $callId (${event.reason})")
                                if (sessions[callId] === session) onInterrupted(callId)
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
        })
        if (sessions.putIfAbsent(callId, session) == null) session.job.start()
    }

    /** Leaves the call's room and releases LiveKit's resources. */
    fun stop(callId: String) {
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
