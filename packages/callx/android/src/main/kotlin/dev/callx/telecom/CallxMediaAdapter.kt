package dev.callx.telecom

/** The media adapter API this core supports. An adapter built for another version is refused. */
const val CALLX_MEDIA_API_VERSION = 1

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
    /** Must equal [CALLX_MEDIA_API_VERSION]. */
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
}
