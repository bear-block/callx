package dev.callx.preview.rn.device

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.*
import com.facebook.react.uimanager.ViewManager
import com.google.firebase.FirebaseApp
import dev.callx.core.Invitation
import kotlinx.coroutines.launch

/** Example-only controls for local signaling and simulated media. Not part of Callx's API. */
class DeviceHostModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
    override fun getName() = "CallxDeviceHost"

    @ReactMethod fun invoke(method: String, arguments: ReadableMap, promise: Promise) {
        DeviceHost.bootstrapError?.let {
            promise.reject(if (it is UnsupportedOperationException) "telecomUnavailable" else "recoveryFailed", it)
            return
        }
        DeviceHost.scope.launch {
            try {
                fun callId() = requireNotNull(arguments.getString("callId"))
                val result: Any? = when (method) {
                    "status" -> Arguments.makeNativeMap(mapOf(
                        "platform" to "android", "simulator" to false,
                        "pushReady" to FirebaseApp.getApps(reactApplicationContext).isNotEmpty(),
                        "pushToken" to DeviceHost.pushToken,
                        "events" to DeviceHost.events(),
                        "endpoints" to DeviceHost.endpoints.map { mapOf("name" to it.name.toString(),
                            "current" to (it == DeviceHost.currentEndpoint)) },
                    ))
                    "incoming" -> DeviceHost.ingress.handleInvitation(Invitation(callId(),
                        arguments.getString("displayName") ?: "Caller",
                        arguments.getString("handle") ?: "callx:caller"))?.toString()
                    "remoteAnswered" -> { DeviceHost.ingress.remoteAnswered(callId()); null }
                    "remoteEnded" -> {
                        val reason = if (arguments.hasKey("reason")) arguments.getString("reason") else null
                        DeviceHost.ingress.remoteEnded(callId(), reason ?: "remoteEnded"); null
                    }
                    "mediaConnected" -> {
                        DeviceHost.runtime.mediaConnected(callId())
                        DeviceHost.record("media connected (simulated) for ${callId()}"); null
                    }
                    "selectAudioEndpoint" -> {
                        val endpoint = DeviceHost.endpoints.getOrNull(arguments.getInt("index"))
                        val id = DeviceHost.activeCallId
                        endpoint != null && id != null && DeviceHost.ingress.requestAudioEndpoint(id, endpoint)
                    }
                    else -> throw IllegalArgumentException("Unknown example action: $method")
                }
                promise.resolve(result)
            } catch (error: Exception) { promise.reject("host", error) }
        }
    }
}

class DeviceHostPackage : ReactPackage {
    override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> = listOf(DeviceHostModule(context))
    override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}
