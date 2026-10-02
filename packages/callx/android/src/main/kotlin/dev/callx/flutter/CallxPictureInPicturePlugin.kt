package dev.callx.flutter

import dev.callx.telecom.CallxPictureInPicture
import io.flutter.embedding.engine.plugins.FlutterPlugin
import io.flutter.embedding.engine.plugins.activity.ActivityAware
import io.flutter.embedding.engine.plugins.activity.ActivityPluginBinding
import io.flutter.plugin.common.EventChannel
import io.flutter.plugin.common.MethodChannel

/** Picture-in-picture for video calls (ADR-0010 addendum): attaches the host Activity to the core. */
internal class CallxPictureInPicturePlugin(private val runtime: () -> dev.callx.core.BridgeRuntime?) :
    ActivityAware, MethodChannel.MethodCallHandler, EventChannel.StreamHandler {
    private var activity: android.app.Activity? = null
    private var methods: MethodChannel? = null
    private var events: EventChannel? = null

    fun attach(binding: FlutterPlugin.FlutterPluginBinding) {
        methods = MethodChannel(binding.binaryMessenger, "dev.callx/pip").also { it.setMethodCallHandler(this) }
        events = EventChannel(binding.binaryMessenger, "dev.callx/pip/events").also { it.setStreamHandler(this) }
    }

    fun detach() {
        methods?.setMethodCallHandler(null); events?.setStreamHandler(null)
        CallxPictureInPicture.listener = null
        CallxPictureInPicture.configure(false)
        CallxPictureInPicture.detach()
        activity = null
        methods = null
        events = null
    }

    override fun onMethodCall(call: io.flutter.plugin.common.MethodCall, result: MethodChannel.Result) {
        activity?.let { CallxPictureInPicture.attach(it, runtime()) }
        when (call.method) {
            "configure" -> { CallxPictureInPicture.configure(call.argument<Boolean>("automatic") == true); result.success(null) }
            "enter" -> result.success(CallxPictureInPicture.enter())
            else -> result.notImplemented()
        }
    }

    override fun onListen(arguments: Any?, sink: EventChannel.EventSink) { CallxPictureInPicture.listener = sink::success }
    override fun onCancel(arguments: Any?) { CallxPictureInPicture.listener = null }

    override fun onAttachedToActivity(binding: ActivityPluginBinding) {
        activity = binding.activity
        CallxPictureInPicture.attach(binding.activity, runtime())
    }
    override fun onReattachedToActivityForConfigChanges(binding: ActivityPluginBinding) = onAttachedToActivity(binding)
    override fun onDetachedFromActivityForConfigChanges() = onDetachedFromActivity()
    override fun onDetachedFromActivity() { activity = null; CallxPictureInPicture.detach() }
}
