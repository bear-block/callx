package dev.callx.livekit

import dev.callx.telecom.CallxAdapterContext
import dev.callx.telecom.CallxMediaAdapter
import dev.callx.telecom.CallxMediaAdapterFactory

/** Declared in this package's manifest; Callx's bootstrap creates it (ADR-0009). */
class LiveKitAdapterFactory : CallxMediaAdapterFactory {
    override fun create(context: CallxAdapterContext): CallxMediaAdapter {
        val app = context.context.applicationContext
        return LiveKitMediaAdapter(app, context.scope, { callId -> CallxLiveKit.credentials(app, callId) }, context.log)
    }
}
