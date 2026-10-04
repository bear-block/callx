package dev.callx.reactnative

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableNativeMap
import dev.callx.core.BridgeRuntime
import dev.callx.core.BridgeViolation

/** The Callx TurboModule; NativeCallxSpec is generated from src/specs/NativeCallx.ts. */
class CallxModule(context: ReactApplicationContext) : NativeCallxSpec(context) {
    companion object {
        @Volatile private var hostRuntime: BridgeRuntime? = null
        /** Install once from Application after creating the native signaling/media executor. */
        @JvmStatic fun configure(runtime: BridgeRuntime) { hostRuntime = runtime }
        /**
         * Starts the whole native pipeline from `Application.onCreate` and installs it for React Native
         * (ADR-0009). See [CallxBootstrap.start] for failures to report as calling unavailable.
         */
        @JvmStatic @JvmOverloads
        fun bootstrap(context: android.content.Context,
            config: dev.callx.telecom.CallxBootstrapConfig = dev.callx.telecom.CallxBootstrapConfig()) =
            dev.callx.telecom.CallxBootstrap.start(context, config, ::configure)
        @JvmStatic fun reset() { hostRuntime = null }
    }

    override fun setup(config: ReadableMap, promise: Promise) {
        hostRuntime?.let {
            try { promise.resolve(Arguments.makeNativeMap(it.setup(config.toHashMap()))) }
            catch (error: Throwable) { reject(promise, error) }; return
        }
        promise.resolve(WritableNativeMap().apply {
            putString("contractVersion", "0.3.0"); putString("coreVersion", "0.3.0")
            putString("execution", "native"); putString("accountGeneration", "unconfigured")
            putBoolean("nativeCalling", false); putBoolean("durableReplay", false)
            putBoolean("providerManagedSignaling", false); putBoolean("hold", false); putBoolean("mute", false)
            putBoolean("video", false); putBoolean("dtmf", false)
        })
    }

    override fun execute(command: ReadableMap, promise: Promise) {
        val runtime = hostRuntime ?: return unavailable(promise)
        try { runtime.execute(command.toHashMap()).whenComplete { value, error ->
            if (error != null) reject(promise, error.cause ?: error) else promise.resolve(Arguments.makeNativeMap(value))
        } } catch (error: Throwable) { reject(promise, error) }
    }
    override fun queryOperation(query: ReadableMap, promise: Promise) = invoke(query, promise) { queryOperation(it) }
    override fun openSession(request: ReadableMap, promise: Promise) = invoke(request, promise) { openSession(it) }
    override fun acknowledge(request: ReadableMap, promise: Promise) = invoke(request, promise) { acknowledge(it); null }
    override fun closeSession(request: ReadableMap, promise: Promise) = invoke(request, promise) { closeSession(it); null }
    override fun getSnapshot(promise: Promise) {
        val runtime = hostRuntime ?: return unavailable(promise)
        try { promise.resolve(Arguments.makeNativeMap(runtime.getSnapshot())) } catch (error: Throwable) { reject(promise, error) }
    }
    override fun getPushToken(promise: Promise) {
        val token = dev.callx.telecom.CallxPushTokens.current
        promise.resolve(token?.let { Arguments.makeNativeMap(mapOf("type" to it.type, "token" to it.token)) })
    }
    private fun requestBody(request: dev.callx.telecom.CallxCallRequest): Map<String, Any> = buildMap {
        put("handle", request.handle); put("video", request.video)
        request.displayName?.let { put("displayName", it) }
    }
    private var callRequestListeners = 0
    override fun releaseCallRequests() {
        callRequestListeners = maxOf(0, callRequestListeners - 1)
        if (callRequestListeners == 0) dev.callx.telecom.CallxCallRequests.setListener(null)
    }
    override fun takeCallRequest(promise: Promise) {
        callRequestListeners++
        attachCallRequests()
        promise.resolve(dev.callx.telecom.CallxCallRequests.take()?.let { Arguments.makeNativeMap(requestBody(it)) })
    }
    private fun attachCallRequests() {
        dev.callx.telecom.CallxCallRequests.setListener({
            reactApplicationContext.runOnUiQueueThread {
                if (!invalidated && callRequestListeners > 0) dev.callx.telecom.CallxCallRequests.take()?.let {
                    reactApplicationContext.getJSModule(com.facebook.react.modules.core.DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                        .emit("callxCallRequest", Arguments.makeNativeMap(requestBody(it)))
                }
            }
        }, notifyPending = false)
    }
    override fun dispose() = Unit

    override fun configurePictureInPicture(options: ReadableMap) {
        val automatic = options.hasKey("automatic") && options.getBoolean("automatic")
        reactApplicationContext.runOnUiQueueThread {
            if (!invalidated) {
                attachActivity()
                dev.callx.telecom.CallxPictureInPicture.configure(automatic)
            }
        }
    }
    override fun enterPictureInPicture(promise: Promise) {
        reactApplicationContext.runOnUiQueueThread {
            if (invalidated) promise.resolve(false)
            else {
                attachActivity()
                promise.resolve(dev.callx.telecom.CallxPictureInPicture.enter())
            }
        }
    }
    @Volatile private var invalidated = false
    private var hostPaused = false
    private var inPictureInPicture = false
    private fun updatePictureInPictureRendering() {
        if (!inPictureInPicture && !hostPaused) return
        // Fabric stops mounting JS updates on Activity pause, even while PiP is visible.
        // Resume only its frame dispatcher; the rest of the React host stays paused.
        val manager = com.facebook.react.uimanager.UIManagerHelper.getUIManager(
            reactApplicationContext, com.facebook.react.uimanager.common.UIManagerType.FABRIC
        ) as? com.facebook.react.fabric.FabricUIManager ?: return
        if (inPictureInPicture) manager.onHostResume()
        else if (hostPaused) manager.onHostPause()
    }
    private val pictureInPictureListener: (Boolean) -> Unit = { inPictureInPicture ->
        this.inPictureInPicture = inPictureInPicture
        if (!invalidated) updatePictureInPictureRendering()
        if (!invalidated) reactApplicationContext
            .getJSModule(com.facebook.react.modules.core.DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit("callxPictureInPicture", inPictureInPicture)
    }

    /** The host Activity can change (recreation, reload); attach the current one before each use. */
    private fun attachActivity() {
        if (invalidated) return
        dev.callx.telecom.CallxPictureInPicture.listener = pictureInPictureListener
        reactApplicationContext.currentActivity?.let { dev.callx.telecom.CallxPictureInPicture.attach(it, hostRuntime) }
    }

    private val lifecycle = object : com.facebook.react.bridge.LifecycleEventListener {
        override fun onHostResume() { hostPaused = false; attachActivity() }
        override fun onHostPause() {
            hostPaused = true
            reactApplicationContext.runOnUiQueueThread {
                if (!invalidated && inPictureInPicture) updatePictureInPictureRendering()
            }
        }
        override fun onHostDestroy() {
            if (dev.callx.telecom.CallxPictureInPicture.listener === pictureInPictureListener) {
                dev.callx.telecom.CallxPictureInPicture.detach()
            }
        }
    }

    private var listenerCount = 0
    // Attach on every JS subscription, like iOS startObserving, so a runtime configured or
    // replaced after this module initialized (for example after login) still reaches JS.
    override fun addListener(eventName: String) {
        listenerCount++
        attachEvents()
        if (eventName == "callxPictureInPicture") {
            reactApplicationContext.runOnUiQueueThread { attachActivity() }
        }
    }
    override fun removeListeners(count: Double) {
        listenerCount = maxOf(0, listenerCount - count.toInt())
        if (listenerCount == 0) { hostRuntime?.setEventListener(null); dev.callx.telecom.CallxCallRequests.setListener(null) }
    }

    override fun initialize() {
        super.initialize(); attachEvents()
        // Keep picture-in-picture following the live Activity.
        reactApplicationContext.addLifecycleEventListener(lifecycle)
    }
    override fun invalidate() {
        invalidated = true
        dev.callx.telecom.CallxCallRequests.setListener(null)
        hostRuntime?.setEventListener(null)
        reactApplicationContext.removeLifecycleEventListener(lifecycle)
        reactApplicationContext.runOnUiQueueThread {
            // A new module may have attached before this old module's queued cleanup runs.
            if (dev.callx.telecom.CallxPictureInPicture.listener === pictureInPictureListener) {
                inPictureInPicture = false
                updatePictureInPictureRendering()
                dev.callx.telecom.CallxPictureInPicture.listener = null
                dev.callx.telecom.CallxPictureInPicture.configure(false)
                dev.callx.telecom.CallxPictureInPicture.detach()
            }
        }
        super.invalidate()
    }
    private fun attachEvents() {
        hostRuntime?.setEventListener { event -> reactApplicationContext
            .getJSModule(com.facebook.react.modules.core.DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit("callxEvent", Arguments.makeNativeMap(event)) }
    }

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
