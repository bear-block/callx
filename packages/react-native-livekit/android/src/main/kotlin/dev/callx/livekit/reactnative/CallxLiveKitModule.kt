package dev.callx.livekit.reactnative

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.uimanager.ViewManager
import dev.callx.livekit.CallxLiveKit

/** JavaScript configuration only; the adapter itself is created natively by Callx's bootstrap. */
class CallxLiveKitModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
    override fun getName() = "CallxLiveKit"

    @ReactMethod fun configure(tokenUrl: String, headers: ReadableMap, promise: Promise) {
        try {
            CallxLiveKit.configure(context, tokenUrl, headers.toHashMap().mapValues { it.value.toString() })
            promise.resolve(null)
        } catch (error: Exception) { promise.reject("invalidArgument", error.message, error) }
    }

    @ReactMethod fun reset(promise: Promise) { CallxLiveKit.reset(context); promise.resolve(null) }
}

class CallxLiveKitPackage : ReactPackage {
    override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> = listOf(CallxLiveKitModule(context))
    override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}
