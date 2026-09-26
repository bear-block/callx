package dev.callx.preview.callx_flutter_example

import android.content.Context
import android.telecom.DisconnectCause
import android.util.Log
import androidx.core.telecom.CallEndpointCompat
import androidx.core.telecom.CallsManager
import dev.callx.core.BridgeCapabilities
import dev.callx.core.BridgeRuntime
import dev.callx.core.CallCoordinator
import dev.callx.core.CoordinatorFileStore
import dev.callx.core.IncomingOutcome
import dev.callx.core.Invitation
import dev.callx.core.OperationReconciliationProbe
import dev.callx.core.ReconciliationOutcome
import dev.callx.core.RecoveredOperationReconciler
import dev.callx.flutter.CallxPlugin
import dev.callx.telecom.CallStylePresenter
import dev.callx.telecom.CoreTelecomSessionManager
import dev.callx.telecom.MediaMuteController
import dev.callx.telecom.TelecomIngress
import dev.callx.telecom.TelecomIngressListener
import dev.callx.telecom.TelecomPlatformExecutor
import dev.callx.telecom.TelecomSystemActionHandler
import java.io.File
import java.util.concurrent.CompletableFuture
import java.util.concurrent.ConcurrentLinkedDeque
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import org.json.JSONObject

/**
 * Device-trial host. A real app connects its signaling client and media engine here; this one
 * has neither, so it records every callback and lets the example UI stand in for the remote side
 * and for media. Nothing in it produces audio.
 */
object CallHost {
    private const val TAG = "CallxExample"
    val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    lateinit var ingress: TelecomIngress; private set
    lateinit var runtime: BridgeRuntime; private set
    @Volatile var pushToken: String? = null
    @Volatile var endpoints: List<CallEndpointCompat> = emptyList(); private set
    @Volatile var currentEndpoint: CallEndpointCompat? = null; private set
    @Volatile var activeCallId: String? = null; private set
    private val events = ConcurrentLinkedDeque<String>()

    /** Runs from Application.onCreate, before FCM can deliver a push to this process. */
    fun start(context: Context) {
        if (::runtime.isInitialized) return
        val callsManager = CallsManager(context)
        callsManager.registerAppWithTelecom(CallsManager.CAPABILITY_BASELINE)
        val media = MediaMuteController { callId, muted -> record("media: mute=$muted for $callId (simulated)"); true }
        ingress = TelecomIngress(scope, CallStylePresenter(context), Listener, media)
        val sessions = CoreTelecomSessionManager(callsManager, ingress.systemActions(SystemActions), scope, ingress.audioObserver)
        val executor = ingress.executor(TelecomPlatformExecutor(scope, sessions, media, outgoing = sessions))
        val coordinator = CallCoordinator(CoordinatorFileStore(File(context.filesDir, "callx/demo-account/coordinator.json").toPath()))
        runtime = BridgeRuntime(coordinator, executor, BridgeCapabilities("demo-account-1",
            durableReplay = true, providerManagedSignaling = false, hold = true, mute = true))
        ingress.attach(runtime, sessions)
        CallxPlugin.configure(runtime)
        record("runtime configured")
        // Without a backend nothing can confirm a pending operation, so report it unavailable.
        scope.launch(Dispatchers.IO) {
            RecoveredOperationReconciler(coordinator, OperationReconciliationProbe {
                CompletableFuture.completedFuture(ReconciliationOutcome.Unavailable(System.currentTimeMillis()))
            }).reconcile(System.currentTimeMillis()).thenAccept { if (it.isNotEmpty()) record("reconciled ${it.size} operations") }
        }
    }

    /** Test harness only: stands in for the signaling socket a real app would use. */
    fun handleTestSignal(json: String) {
        val signal = try { JSONObject(json) } catch (_: Exception) { record("ignored malformed test signal"); return }
        val callId = signal.optString("callId").takeIf { it.isNotEmpty() } ?: return
        scope.launch {
            when (signal.optString("type")) {
                "call.ended" -> ingress.remoteEnded(callId, signal.optString("reason", "remoteEnded"))
                "call.accepted" -> ingress.remoteAnswered(callId)
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
