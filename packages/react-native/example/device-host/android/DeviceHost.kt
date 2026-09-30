package dev.callx.preview.rn.device

import android.content.Context
import android.os.Build
import android.telecom.DisconnectCause
import android.util.Log
import androidx.core.telecom.CallEndpointCompat
import androidx.core.telecom.CallsManager
import com.google.firebase.FirebaseApp
import com.google.firebase.messaging.FirebaseMessaging
import dev.callx.core.BridgeCapabilities
import dev.callx.core.BridgeRuntime
import dev.callx.core.CallCoordinator
import dev.callx.core.CoordinatorFileStore
import dev.callx.core.IncomingOutcome
import dev.callx.core.Invitation
import dev.callx.core.OperationReconciliationProbe
import dev.callx.core.ReconciliationOutcome
import dev.callx.core.RecoveredOperationReconciler
import dev.callx.reactnative.CallxModule
import dev.callx.telecom.CallStylePresenter
import dev.callx.telecom.CallxFullScreenIntent
import dev.callx.telecom.CallxTelecomAvailability
import dev.callx.telecom.CoreTelecomSessionManager
import dev.callx.telecom.TelecomIngress
import dev.callx.telecom.TelecomIngressListener
import dev.callx.telecom.TelecomPlatformExecutor
import dev.callx.telecom.TelecomSystemActionHandler
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.CompletableFuture
import java.util.concurrent.ConcurrentLinkedDeque
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import org.json.JSONObject

/**
 * Device-trial host. A real app connects its signaling client and media engine here. This one has
 * no signaling client: it records every callback and lets the example UI and the call console
 * stand in for the remote side. Media is real when the console and `npm run media:server` run:
 * [LiveKitCallMedia] joins the call's LiveKit room on answer. Otherwise the UI simulates it.
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
    private lateinit var media: LiveKitCallMedia
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
        CallxTelecomAvailability.requireSupported(context)
        val callsManager = CallsManager(context)
        callsManager.registerAppWithTelecom(CallsManager.CAPABILITY_BASELINE)
        // A CallxMediaAdapter: the ingress starts and stops it with each call (ADR-0009).
        media = LiveKitCallMedia(context, scope, ::mediaCredentials, log = ::record)
        ingress = TelecomIngress(scope, CallStylePresenter(context), Listener, media)
        val sessions = CoreTelecomSessionManager(callsManager, ingress.systemActions(SystemActions), scope, ingress.audioObserver)
        val executor = ingress.executor(TelecomPlatformExecutor(scope, sessions, media, outgoing = sessions))
        val coordinator = CallCoordinator(CoordinatorFileStore(File(context.filesDir, "callx/demo-account/coordinator.json").toPath()))
        runtime = BridgeRuntime(coordinator, executor, BridgeCapabilities("demo-account-1",
            durableReplay = true, providerManagedSignaling = false, hold = true, mute = true))
        ingress.attach(runtime, sessions)
        // New process only. No session exists yet; persist termination and remove stale UI
        // before FCM or Dart can create a new call.
        runBlocking {
            ingress.recoverAfterProcessDeath()?.let { record("recovered ${it.callId}: ${it.endReason}") }
        }
        CallxModule.configure(runtime)
        record("runtime configured")
        // Without it a locked device shows the call as a notification, not the full-screen call screen.
        if (!CallxFullScreenIntent.isAllowed(context)) record("full-screen intents denied: allow them in Settings")
        // Without a backend nothing can confirm a pending operation, so report it unavailable.
        scope.launch(Dispatchers.IO) {
            RecoveredOperationReconciler(coordinator, OperationReconciliationProbe {
                CompletableFuture.completedFuture(ReconciliationOutcome.Unavailable(System.currentTimeMillis()))
            }).reconcile(System.currentTimeMillis()).thenAccept { if (it.isNotEmpty()) record("reconciled ${it.size} operations") }
        }
    }

    /** Test harness only: the call console issues LiveKit tokens as a backend would. */
    private fun mediaCredentials(callId: String): MediaCredentials {
        val body = JSONObject().put("callId", callId).put("identity", "callee").put("name", Build.MODEL).toString()
        val connection = URL("http://127.0.0.1:8787/api/media-token").openConnection() as HttpURLConnection
        return try {
            connection.connectTimeout = 2000; connection.readTimeout = 2000; connection.requestMethod = "POST"
            connection.doOutput = true; connection.setRequestProperty("content-type", "application/json")
            connection.outputStream.use { it.write(body.toByteArray()) }
            if (connection.responseCode != 200) error("console answered ${connection.responseCode}")
            val reply = JSONObject(connection.inputStream.bufferedReader().readText())
            MediaCredentials(reply.getString("url"), reply.getString("token"))
        } catch (error: java.io.IOException) {
            throw IllegalStateException("no media server; use \"Media connected (simulated)\" (${error.message})")
        } finally { connection.disconnect() }
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
