package dev.callx.preview.callx_flutter_example

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import androidx.core.app.ActivityCompat
import com.google.firebase.FirebaseApp
import dev.callx.core.Invitation
import dev.callx.telecom.CallxLockScreen
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import kotlinx.coroutines.launch

class MainActivity : FlutterActivity() {
    private val main = Handler(Looper.getMainLooper())
    private var cameraPermissionResult: MethodChannel.Result? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState); CallxLockScreen.onIntent(this, intent)
        // Ask while the app is in use: the prompt cannot appear once a call rings on the lock screen.
        val missing = runtimePermissions().filter { checkSelfPermission(it) != PackageManager.PERMISSION_GRANTED }
        if (missing.isNotEmpty()) ActivityCompat.requestPermissions(this, missing.toTypedArray(), 1)
    }

    private fun runtimePermissions() = listOfNotNull(Manifest.permission.RECORD_AUDIO,
        Manifest.permission.POST_NOTIFICATIONS.takeIf { Build.VERSION.SDK_INT >= 33 })

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode != 2) return
        val pending = cameraPermissionResult ?: return
        cameraPermissionResult = null
        if (checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) pending.success(null)
        else pending.error("cameraPermission", "Camera permission was denied", null)
    }

    override fun onDestroy() {
        cameraPermissionResult?.error("nativeUnavailable", "Activity closed during camera permission request", null)
        cameraPermissionResult = null
        super.onDestroy()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent); CallxLockScreen.onIntent(this, intent)
    }

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "callx_example/host").setMethodCallHandler { call, result ->
            CallHost.bootstrapError?.let {
                result.error(if (it is UnsupportedOperationException) "telecomUnavailable" else "hostUnavailable", it.message, null)
                return@setMethodCallHandler
            }
            fun reply(block: suspend () -> Any?) = CallHost.scope.launch {
                val value = try { block() } catch (error: Exception) { main.post { result.error("host", error.message, null) }; return@launch }
                main.post { result.success(value.takeUnless { it == Unit }) }
            }
            val callId = call.argument<String>("callId")
            when (call.method) {
                "status" -> result.success(mapOf(
                    "platform" to "android",
                    "pushReady" to FirebaseApp.getApps(this).isNotEmpty(),
                    "pushToken" to CallHost.pushToken,
                    "events" to CallHost.events(),
                    "endpoints" to CallHost.endpoints.map { mapOf("name" to it.name.toString(),
                        "current" to (it == CallHost.currentEndpoint)) },
                ))
                "requestPermissions" -> {
                    ActivityCompat.requestPermissions(this, runtimePermissions().toTypedArray(), 1)
                    result.success(null)
                }
                "requestCameraPermission" -> {
                    if (checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) result.success(null)
                    else if (cameraPermissionResult != null) result.error("permissionPending", "Camera permission request in progress", null)
                    else {
                        cameraPermissionResult = result
                        ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.CAMERA), 2)
                    }
                }
                "incoming" -> reply {
                    // Same path as a push, without FCM: an invitation arriving over signaling.
                    CallHost.ingress.handleInvitation(Invitation(callId!!, call.argument<String>("displayName")!!,
                        "callx:${call.argument<String>("displayName")}", video = call.argument<Boolean>("video") == true))?.toString()
                }
                "remoteAnswered" -> reply { CallHost.ingress.remoteAnswered(callId!!) }
                "remoteEnded" -> reply { CallHost.ingress.remoteEnded(callId!!, call.argument<String>("reason") ?: "remoteEnded") }
                "mediaConnected" -> reply { CallHost.runtime.mediaConnected(callId!!); CallHost.record("media connected (simulated) for $callId") }
                "selectAudioEndpoint" -> reply {
                    val endpoint = CallHost.endpoints.getOrNull(call.argument<Int>("index") ?: -1)
                    val target = CallHost.activeCallId
                    endpoint != null && target != null && CallHost.ingress.requestAudioEndpoint(target, endpoint)
                }
                else -> result.notImplemented()
            }
        }
    }
}
