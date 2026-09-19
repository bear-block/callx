package dev.callx.flutter

import io.flutter.embedding.engine.plugins.FlutterPlugin
import io.flutter.plugin.common.EventChannel
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel

class CallxPlugin : FlutterPlugin, MethodChannel.MethodCallHandler, EventChannel.StreamHandler {
    private lateinit var methods: MethodChannel
    private lateinit var events: EventChannel

    override fun onAttachedToEngine(binding: FlutterPlugin.FlutterPluginBinding) {
        methods = MethodChannel(binding.binaryMessenger, "dev.callx/methods")
        events = EventChannel(binding.binaryMessenger, "dev.callx/events")
        methods.setMethodCallHandler(this)
        events.setStreamHandler(this)
    }

    override fun onDetachedFromEngine(binding: FlutterPlugin.FlutterPluginBinding) {
        methods.setMethodCallHandler(null)
        events.setStreamHandler(null)
    }

    override fun onMethodCall(call: MethodCall, result: MethodChannel.Result) {
        when (call.method) {
            "setup" -> result.success(mapOf(
                "contractVersion" to "0.1.0", "coreVersion" to "0.1.0",
                "execution" to "native", "accountGeneration" to "unconfigured",
                "nativeCalling" to false, "durableReplay" to false,
                "providerManagedSignaling" to false, "hold" to false, "mute" to false,
            ))
            "dispose" -> result.success(null)
            else -> result.error("notConfigured", "Native Callx host has not been configured.", null)
        }
    }

    override fun onListen(arguments: Any?, sink: EventChannel.EventSink?) = Unit
    override fun onCancel(arguments: Any?) = Unit
}
