package dev.callx.flutter

import android.os.Handler
import android.os.Looper
import dev.callx.core.BridgeRuntime
import dev.callx.core.BridgeViolation
import io.flutter.embedding.engine.plugins.FlutterPlugin
import io.flutter.embedding.engine.plugins.activity.ActivityAware
import io.flutter.embedding.engine.plugins.activity.ActivityPluginBinding
import io.flutter.plugin.common.EventChannel
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import kotlinx.coroutines.launch

class CallxPlugin : FlutterPlugin, MethodChannel.MethodCallHandler, EventChannel.StreamHandler, ActivityAware {
    private lateinit var methods: MethodChannel
    private lateinit var requests: EventChannel
    private lateinit var events: EventChannel
    private val pictureInPicture = CallxPictureInPicturePlugin { hostRuntime }
    private val main = Handler(Looper.getMainLooper())

    companion object {
        @Volatile private var hostRuntime: BridgeRuntime? = null
        /** Install once from Application after creating the native signaling/media executor. */
        @JvmStatic fun configure(runtime: BridgeRuntime) { hostRuntime = runtime }
        /**
         * Starts the whole native pipeline from `Application.onCreate` and installs it for Flutter
         * (ADR-0009). See [CallxBootstrap.start] for failures to report as calling unavailable.
         */
        @JvmStatic @JvmOverloads
        fun bootstrap(context: android.content.Context,
            config: dev.callx.telecom.CallxBootstrapConfig = dev.callx.telecom.CallxBootstrapConfig()) =
            dev.callx.telecom.CallxBootstrap.start(context, config, ::configure)
        @JvmStatic fun reset() { hostRuntime = null }
    }

    override fun onAttachedToEngine(binding: FlutterPlugin.FlutterPluginBinding) {
        methods = MethodChannel(binding.binaryMessenger, "dev.callx/methods")
        events = EventChannel(binding.binaryMessenger, "dev.callx/events")
        methods.setMethodCallHandler(this)
        events.setStreamHandler(this)
        requests = EventChannel(binding.binaryMessenger, "dev.callx/call_requests")
        requests.setStreamHandler(object : EventChannel.StreamHandler {
            private var active = false
            override fun onListen(arguments: Any?, sink: EventChannel.EventSink?) {
                active = true
                dev.callx.telecom.CallxCallRequests.setListener({ main.post {
                    if (active) dev.callx.telecom.CallxCallRequests.take()?.let { request ->
                        sink?.success(buildMap<String, Any> {
                            put("handle", request.handle); put("video", request.video)
                            request.displayName?.let { put("displayName", it) }
                        })
                    }
                } })
            }
            override fun onCancel(arguments: Any?) { active = false; dev.callx.telecom.CallxCallRequests.setListener(null) }
        })
        binding.platformViewRegistry.registerViewFactory("dev.callx/video", CallxVideoViewFactory())
        pictureInPicture.attach(binding)
    }

    override fun onDetachedFromEngine(binding: FlutterPlugin.FlutterPluginBinding) {
        methods.setMethodCallHandler(null)
        events.setStreamHandler(null)
        requests.setStreamHandler(null)
        dev.callx.telecom.CallxCallRequests.setListener(null)
        pictureInPicture.detach()
    }

    override fun onAttachedToActivity(binding: ActivityPluginBinding) = pictureInPicture.onAttachedToActivity(binding)
    override fun onReattachedToActivityForConfigChanges(binding: ActivityPluginBinding) =
        pictureInPicture.onReattachedToActivityForConfigChanges(binding)
    override fun onDetachedFromActivityForConfigChanges() = pictureInPicture.onDetachedFromActivityForConfigChanges()
    override fun onDetachedFromActivity() = pictureInPicture.onDetachedFromActivity()

    override fun onMethodCall(call: MethodCall, result: MethodChannel.Result) {
        val runtime = hostRuntime
        when (call.method) {
            "setup" -> if (runtime == null) result.success(mapOf(
                "contractVersion" to "0.3.0", "coreVersion" to "0.3.0",
                "execution" to "native", "accountGeneration" to "unconfigured",
                "nativeCalling" to false, "durableReplay" to false,
                "providerManagedSignaling" to false, "hold" to false, "mute" to false, "video" to false, "dtmf" to false,
            )) else invoke(runtime, call, result)
            "dispose" -> result.success(null)
            "remoteAnswered", "remoteEnded" -> signal(call, result)
            else -> if (runtime == null) unavailable(result) else invoke(runtime, call, result)
        }
    }

    private fun invoke(runtime: BridgeRuntime, call: MethodCall, result: MethodChannel.Result) {
        try {
            @Suppress("UNCHECKED_CAST") val arguments = (call.arguments as? Map<String, Any?>).orEmpty()
            when (call.method) {
                "setup" -> result.success(runtime.setup(arguments))
                "execute" -> runtime.execute(arguments).whenComplete { value, error -> main.post {
                    if (error != null) failure(result, error.cause ?: error) else result.success(value)
                } }
                "queryOperation" -> result.success(runtime.queryOperation(arguments))
                "openSession" -> result.success(runtime.openSession(arguments))
                "acknowledge" -> { runtime.acknowledge(arguments); result.success(null) }
                "closeSession" -> { runtime.closeSession(arguments); result.success(null) }
                "getSnapshot" -> result.success(runtime.getSnapshot())
                "getPushToken" -> result.success(dev.callx.telecom.CallxPushTokens.current
                    ?.let { mapOf("type" to it.type, "token" to it.token) })
                else -> result.notImplemented()
            }
        } catch (error: Throwable) { failure(result, error) }
    }
    /** Backend events from Dart (ADR-0014): the same ingress calls native host code makes. */
    private fun signal(call: MethodCall, result: MethodChannel.Result) {
        val ingress = dev.callx.telecom.CallxBootstrap.started?.ingress
            ?: return result.error("notConfigured", "Callx was not started with CallxPlugin.bootstrap.", null)
        val callId = call.argument<String>("callId")
            ?: return result.error("invalidArgument", "callId is required.", null)
        val reason = call.argument<String>("reason") ?: "remoteEnded"
        dev.callx.telecom.CallxBootstrap.scope.launch {
            val outcome = runCatching {
                if (call.method == "remoteAnswered") ingress.remoteAnswered(callId) else ingress.remoteEnded(callId, reason)
            }
            main.post { outcome.fold({ result.success(it) }, { failure(result, it) }) }
        }
    }

    private fun failure(result: MethodChannel.Result, error: Throwable) {
        val violation = error as? BridgeViolation
        result.error(violation?.code ?: "internal", error.message ?: "Native Callx operation failed.", null)
    }
    private fun unavailable(result: MethodChannel.Result) =
        result.error("notConfigured", "Native Callx host has not been configured.", null)

    override fun onListen(arguments: Any?, sink: EventChannel.EventSink?) {
        hostRuntime?.setEventListener { event -> main.post { sink?.success(event) } }
    }
    override fun onCancel(arguments: Any?) { hostRuntime?.setEventListener(null) }
}
