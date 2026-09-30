package dev.callx.preview.rn.device

import android.content.Context
import android.telecom.DisconnectCause
import android.util.Log
import androidx.core.telecom.CallEndpointCompat
import com.google.firebase.FirebaseApp
import com.google.firebase.messaging.FirebaseMessaging
import dev.callx.core.BridgeRuntime
import dev.callx.core.IncomingOutcome
import dev.callx.core.Invitation
import dev.callx.reactnative.CallxModule
import dev.callx.livekit.CallxLiveKit
import dev.callx.telecom.CallxBootstrapConfig
import dev.callx.telecom.CallxFullScreenIntent
import dev.callx.telecom.TelecomIngress
import dev.callx.telecom.TelecomIngressListener
import dev.callx.telecom.TelecomSystemActionHandler
import java.io.File
import java.util.concurrent.ConcurrentLinkedDeque
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import org.json.JSONObject

/**
 * Device-trial host. A real app connects its signaling client and media engine here. This one has
 * no signaling client: it records every callback and lets the example UI and the call console
 * stand in for the remote side. Media is real when the console and `npm run media:server` run:
 * the callx-livekit adapter joins the call's LiveKit room on answer. Otherwise the UI simulates it.
 */
object DeviceHost {
    private const val TAG = "CallxExample"
    val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    lateinit var ingress: TelecomIngress; private set
    lateinit var runtime: BridgeRuntime; private set
    @Volatile var pushToken: String? = null
    @Volatile var endpoints: List<CallEndpointCompat> = emptyList(); private set
    @Volatile var currentEndpoint: CallEndpointCompat? = null; private set
    @Volatile var activeCallId: String? = null; private set
    private val events = ConcurrentLinkedDeque<String>()

    @Volatile var bootstrapError: Throwable? = null; private set

    /** Called from Application.onCreate before React Native starts. */
    fun bootstrap(context: Context) {
        ConsoleReporter.start("react-native", { pushToken }, ::events)
        try { start(context) } catch (error: Exception) {
            bootstrapError = error
            record("bootstrap failed: ${error.message}")
            return
        }
        // FirebaseApp exists only when google-services.json was present at prebuild time.
        if (FirebaseApp.getApps(context).isEmpty()) {
            record("Firebase not configured: add packages/secrets/google-services.json and prebuild")
            return
        }
        FirebaseMessaging.getInstance().token
            .addOnSuccessListener { pushToken = it; record("FCM token ready") }
            .addOnFailureListener { record("FCM token failed: ${it.message}") }
    }

    /** One native runtime per process; a JS reload does not repeat recovery. */
    private fun start(context: Context) {
        if (::runtime.isInitialized) return
        // The call console stands in for the app's token endpoint. Apps usually configure this
        // from JavaScript after sign-in (configureLiveKit); it persists for killed-app answers.
        CallxLiveKit.configure(context, "http://127.0.0.1:8787/api/media-token")
        // The whole native pipeline in one call (ADR-0009); callx-livekit is discovered from its manifest.
        val started = CallxModule.bootstrap(context, CallxBootstrapConfig(
            accountGeneration = "demo-account-1",
            checkpointPath = File(context.filesDir, "callx/demo-account/coordinator.json").toPath(),
            listener = Listener,
            systemActions = SystemActions,
            log = ::record,
        ))
        ingress = started.ingress; runtime = started.runtime
        started.recoveredCall?.let { record("recovered ${it.callId}: ${it.endReason}") }
        record("runtime configured, media: ${started.media}")
        // Without it a locked device shows the call as a notification, not the full-screen call screen.
        if (!CallxFullScreenIntent.isAllowed(context)) record("full-screen intents denied: allow them in Settings")
    }

    /** Test harness only: stands in for the signaling socket a real app would use. */
    fun handleTestSignal(json: String) {
        val signal = try { JSONObject(json) } catch (_: Exception) { record("ignored malformed test signal"); return }
        val callId = signal.optString("callId").takeIf { it.isNotEmpty() } ?: return
        scope.launch {
            when (signal.optString("type")) {
                "call.ended" -> signal.optString("reason", "remoteEnded").let { reason ->
                    ingress.remoteEnded(callId, reason); record("remote ended $callId: $reason")
                }
                "call.accepted" -> { ingress.remoteAnswered(callId); record("remote answered $callId") }
                else -> record("ignored test signal ${signal.optString("type")}")
            }
        }
    }

    fun events(): List<String> = events.toList()
    fun record(message: String) {
        Log.i(TAG, message)
        events.addFirst("${java.text.SimpleDateFormat("HH:mm:ss", java.util.Locale.ROOT).format(java.util.Date())}  $message")
        while (events.size > 40) events.pollLast()
    }

    private object Listener : TelecomIngressListener {
        override fun onPushReceived(callId: String?, priority: Int?, originalPriority: Int?) {
            val lowered = priority != null && originalPriority != null && priority > originalPriority
            record("push for ${callId ?: "undecodable payload"}: priority $priority, original $originalPriority" +
                if (lowered) " — FCM deprioritized it" else "")
        }
        override fun onInvitationAccepted(invitation: Invitation) {
            activeCallId = invitation.callId; record("ringing ${invitation.callId} (${invitation.displayName})")
        }
        override fun onInvitationRejected(invitation: Invitation?, outcome: IncomingOutcome?) {
            record("did not ring ${invitation?.callId ?: "undecodable payload"}: ${outcome ?: "not recorded or refused by Telecom"}")
        }
        override fun onUserAnswered(callId: String) { record("answered from notification: $callId") }
        override fun onUserEnded(callId: String) { record("ended from notification: $callId") }
        override fun onRingTimedOut(callId: String) { record("ring deadline passed: $callId") }
        override fun onAudioEndpointsChanged(callId: String, current: CallEndpointCompat, available: List<CallEndpointCompat>) {
            activeCallId = callId; currentEndpoint = current; endpoints = available
            record("audio: ${current.name} of ${available.joinToString { it.name }}")
        }
    }

    private object SystemActions : TelecomSystemActionHandler {
        override suspend fun answer(callId: String, callType: Int) { record("system surface answered $callId") }
        override suspend fun disconnect(callId: String, cause: DisconnectCause) { record("system surface ended $callId: ${cause.code}") }
        override suspend fun setActive(callId: String) { record("system surface resumed $callId") }
        override suspend fun setInactive(callId: String) { record("system surface held $callId") }
    }
}
