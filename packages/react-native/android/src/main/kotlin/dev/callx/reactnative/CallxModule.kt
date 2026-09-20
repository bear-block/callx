package dev.callx.reactnative

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableNativeMap
import dev.callx.core.BridgeRuntime
import dev.callx.core.BridgeViolation

class CallxModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
    companion object {
        @Volatile private var hostRuntime: BridgeRuntime? = null
        /** Install once from Application after creating the native signaling/media executor. */
        @JvmStatic fun configure(runtime: BridgeRuntime) { hostRuntime = runtime }
        @JvmStatic fun reset() { hostRuntime = null }
    }
    override fun getName() = "Callx"

    @ReactMethod fun setup(config: ReadableMap, promise: Promise) {
        hostRuntime?.let {
            try { promise.resolve(Arguments.makeNativeMap(it.setup(config.toHashMap()))) }
            catch (error: Throwable) { reject(promise, error) }; return
        }
        promise.resolve(WritableNativeMap().apply {
            putString("contractVersion", "0.1.0"); putString("coreVersion", "0.1.0")
            putString("execution", "native"); putString("accountGeneration", "unconfigured")
            putBoolean("nativeCalling", false); putBoolean("durableReplay", false)
            putBoolean("providerManagedSignaling", false); putBoolean("hold", false); putBoolean("mute", false)
        })
    }

    @ReactMethod fun execute(command: ReadableMap, promise: Promise) {
        val runtime = hostRuntime ?: return unavailable(promise)
        try { runtime.execute(command.toHashMap()).whenComplete { value, error ->
            if (error != null) reject(promise, error.cause ?: error) else promise.resolve(Arguments.makeNativeMap(value))
        } } catch (error: Throwable) { reject(promise, error) }
    }
    @ReactMethod fun queryOperation(query: ReadableMap, promise: Promise) = invoke(query, promise) { queryOperation(it) }
    @ReactMethod fun openSession(request: ReadableMap, promise: Promise) = invoke(request, promise) { openSession(it) }
    @ReactMethod fun acknowledge(request: ReadableMap, promise: Promise) = invoke(request, promise) { acknowledge(it); null }
    @ReactMethod fun closeSession(request: ReadableMap, promise: Promise) = invoke(request, promise) { closeSession(it); null }
    @ReactMethod fun getSnapshot(promise: Promise) {
        val runtime = hostRuntime ?: return unavailable(promise)
        try { promise.resolve(Arguments.makeNativeMap(runtime.getSnapshot())) } catch (error: Throwable) { reject(promise, error) }
    }
    @ReactMethod fun dispose() = Unit
    @ReactMethod fun addListener(eventName: String) = Unit
    @ReactMethod fun removeListeners(count: Double) = Unit

    override fun initialize() {
        super.initialize()
        hostRuntime?.setEventListener { event -> reactApplicationContext
            .getJSModule(com.facebook.react.modules.core.DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit("callxEvent", Arguments.makeNativeMap(event)) }
    }
    override fun invalidate() { hostRuntime?.setEventListener(null); super.invalidate() }

    private fun invoke(request: ReadableMap, promise: Promise, action: BridgeRuntime.(Map<String, Any?>) -> Any?) {
        val runtime = hostRuntime ?: return unavailable(promise)
        try {
            val value = runtime.action(request.toHashMap())
            promise.resolve(if (value is Map<*, *>) nativeMap(value) else value)
        } catch (error: Throwable) { reject(promise, error) }
    }
    private fun reject(promise: Promise, error: Throwable) {
        val violation = error as? BridgeViolation
        promise.reject(violation?.code ?: "internal", error.message ?: "Native Callx operation failed.")
    }
    @Suppress("UNCHECKED_CAST")
    private fun nativeMap(value: Map<*, *>) = Arguments.makeNativeMap(value as Map<String, Any?>)

    private fun unavailable(promise: Promise) =
        promise.reject("notConfigured", "Native Callx host has not been configured.")
}
