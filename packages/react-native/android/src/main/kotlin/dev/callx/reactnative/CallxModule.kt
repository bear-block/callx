package dev.callx.reactnative

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableNativeMap

class CallxModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
    override fun getName() = "Callx"

    @ReactMethod fun setup(config: ReadableMap, promise: Promise) {
        promise.resolve(WritableNativeMap().apply {
            putString("contractVersion", "0.1.0"); putString("coreVersion", "0.1.0")
            putString("execution", "native"); putString("accountGeneration", "unconfigured")
            putBoolean("nativeCalling", false); putBoolean("durableReplay", false)
            putBoolean("providerManagedSignaling", false); putBoolean("hold", false); putBoolean("mute", false)
        })
    }

    @ReactMethod fun execute(command: ReadableMap, promise: Promise) = unavailable(promise)
    @ReactMethod fun queryOperation(query: ReadableMap, promise: Promise) = unavailable(promise)
    @ReactMethod fun openSession(request: ReadableMap, promise: Promise) = unavailable(promise)
    @ReactMethod fun acknowledge(request: ReadableMap, promise: Promise) = unavailable(promise)
    @ReactMethod fun closeSession(request: ReadableMap, promise: Promise) = unavailable(promise)
    @ReactMethod fun getSnapshot(promise: Promise) = unavailable(promise)
    @ReactMethod fun dispose() = Unit
    @ReactMethod fun addListener(eventName: String) = Unit
    @ReactMethod fun removeListeners(count: Double) = Unit

    private fun unavailable(promise: Promise) =
        promise.reject("notConfigured", "Native Callx host has not been configured.")
}
