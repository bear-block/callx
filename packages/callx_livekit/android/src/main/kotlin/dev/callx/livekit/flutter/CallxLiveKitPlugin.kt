package dev.callx.livekit.flutter

import android.content.Context
import dev.callx.livekit.CallxLiveKit
import io.flutter.embedding.engine.plugins.FlutterPlugin
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel

/** Dart configuration only; the adapter itself is created natively by callx's bootstrap. */
class CallxLiveKitPlugin : FlutterPlugin, MethodChannel.MethodCallHandler {
    private lateinit var channel: MethodChannel
    private lateinit var context: Context

    override fun onAttachedToEngine(binding: FlutterPlugin.FlutterPluginBinding) {
        context = binding.applicationContext
        channel = MethodChannel(binding.binaryMessenger, "dev.callx.livekit").also { it.setMethodCallHandler(this) }
    }

    override fun onDetachedFromEngine(binding: FlutterPlugin.FlutterPluginBinding) { channel.setMethodCallHandler(null) }

    override fun onMethodCall(call: MethodCall, result: MethodChannel.Result) {
        when (call.method) {
            "configure" -> try {
                val headers = call.argument<Map<String, String>>("headers").orEmpty()
                CallxLiveKit.configure(context, call.argument<String>("tokenUrl")!!, headers)
                result.success(null)
            } catch (error: Exception) { result.error("invalidArgument", error.message, null) }
            "reset" -> { CallxLiveKit.reset(context); result.success(null) }
            else -> result.notImplemented()
        }
    }
}
