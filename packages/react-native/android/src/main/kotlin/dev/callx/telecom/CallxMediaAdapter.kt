package dev.callx.telecom

import android.widget.FrameLayout
import dev.callx.core.CameraFacing
import dev.callx.core.LocalVideo

/** The audio media adapter API. An adapter built for a version this core does not know is refused. */
const val CALLX_MEDIA_API_VERSION = 1

/** The video media adapter API: [CallxVideoAdapter] (ADR-0010). */
const val CALLX_VIDEO_API_VERSION = 2

/** True when this core can run [adapter]: version 1, or version 2 implementing [CallxVideoAdapter]. */
fun callxSupportsMediaAdapter(adapter: CallxMediaAdapter): Boolean = when (adapter.apiVersion) {
    CALLX_MEDIA_API_VERSION -> true
    CALLX_VIDEO_API_VERSION -> adapter is CallxVideoAdapter
    else -> false
}

/**
 * Carries a call's media (ADR-0009). Pass it as `media` to [TelecomIngress] and
 * [TelecomPlatformExecutor]: the ingress starts it when the call is answered from any surface and
 * stops it when the call ends for any reason. It never ends or holds the call; it reports media
 * state through [CallxMediaSink].
 *
 * Route audio only through Telecom endpoints ([TelecomIngress.requestAudioEndpoint]); do not run
 * a competing route manager.
 */
interface CallxMediaAdapter : MediaMuteController {
    /** [CALLX_MEDIA_API_VERSION]; [CallxVideoAdapter] reports [CALLX_VIDEO_API_VERSION]. */
    val apiVersion: Int get() = CALLX_MEDIA_API_VERSION

    /** The call was answered. Runs under the ingress lock: return at once and connect asynchronously. */
    fun start(callId: String, sink: CallxMediaSink)

    /** The call ended, or never rang. Idempotent; also runs under the ingress lock. */
    fun stop(callId: String)
}

/** The adapter's only way into call state: readiness and interruption, never an end or a hold. */
interface CallxMediaSink {
    /** Remote media flows: first connection, or recovery after [interrupted]. */
    fun connected()

    /** Connected media dropped, for example while the provider reconnects. */
    fun interrupted()

    /**
     * Video changed (video adapters only). [localVideo] can only be [LocalVideo.blocked] (the OS
     * took the camera) or [LocalVideo.on] (it gave it back); [remoteVideo] is whether a remote
     * video track can be rendered. Pass null for what did not change.
     */
    fun videoChanged(localVideo: LocalVideo? = null, remoteVideo: Boolean? = null) {}
}

/** Which video a [CallxVideoSurface] shows. */
enum class VideoSource { local, remote }

/**
 * A framework view's container for one video source. The adapter adds its own renderer view
 * (it must be a TextureView-based renderer for Flutter) to [container] on [CallxVideoAdapter.attach]
 * and removes it on [CallxVideoAdapter.detach]. The core never sees frames.
 */
class CallxVideoSurface(
    val container: FrameLayout,
    val fit: Fit = Fit.cover,
    /** Mirror horizontally, usually for the front camera's local preview. */
    val mirror: Boolean = false,
) {
    enum class Fit { cover, contain }
}

/** Why the camera could not follow a command. Each maps to the contract error code of the same name. */
enum class CallxCameraError { permissionDenied, mediaNotReady, platformRejected }

/**
 * A media adapter that also carries video in the call's room (ADR-0010, adapter API 2). The core
 * calls [setCamera] for `setCamera` and `switchCamera` commands, and [attach]/[detach] when a
 * `CallxVideoView` mounts or unmounts.
 */
interface CallxVideoAdapter : CallxMediaAdapter {
    override val apiVersion: Int get() = CALLX_VIDEO_API_VERSION

    /**
     * Publishes the camera facing [facing], switches the camera while it is on, or stops
     * publishing when [on] is false. Return null once applied, or the reason it was not. The core
     * checks that the app is in the foreground before turning the camera on.
     */
    suspend fun setCamera(callId: String, on: Boolean, facing: CameraFacing): CallxCameraError?

    /** Render [source] of [callId] into [surface] once it exists, until [detach]. Main thread. */
    fun attach(callId: String, source: VideoSource, surface: CallxVideoSurface)

    /** Stop rendering into [surface]. Idempotent. Main thread. */
    fun detach(callId: String, surface: CallxVideoSurface)
}
