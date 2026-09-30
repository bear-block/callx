package dev.callx.livekit

import android.content.Context

/**
 * Configuration of the LiveKit adapter. Configure once, for example after sign-in; the
 * configuration persists, so a call answered while the app was killed still gets credentials.
 */
object CallxLiveKit {
    @Volatile private var provider: LiveKitCredentialProvider? = null

    /** HTTP credential source (see [LiveKitTokenEndpoint]); persisted, headers encrypted. */
    @JvmStatic @JvmOverloads
    fun configure(context: Context, tokenUrl: String, headers: Map<String, String> = emptyMap()) {
        require(tokenUrl.startsWith("https://") || tokenUrl.startsWith("http://")) { "tokenUrl must be an http(s) URL." }
        LiveKitConfigStore(context).save(tokenUrl, headers)
    }

    /**
     * Native credential source, for hosts that already hold credentials natively. Register it in
     * `Application.onCreate` before `bootstrap`; it takes precedence over [configure]. Not persisted.
     */
    @JvmStatic
    fun setCredentialProvider(provider: LiveKitCredentialProvider?) { this.provider = provider }

    /** Forget the persisted source, for example on sign-out. */
    @JvmStatic
    fun reset(context: Context) { LiveKitConfigStore(context).clear() }

    internal suspend fun credentials(context: Context, callId: String): LiveKitCredentials {
        provider?.let { return it.credentials(callId) }
        val (tokenUrl, headers) = LiveKitConfigStore(context).load()
            ?: throw IllegalStateException("LiveKit adapter is not configured: call configure(tokenUrl) after sign-in.")
        return LiveKitTokenEndpoint.fetch(tokenUrl, headers, callId)
    }
}
