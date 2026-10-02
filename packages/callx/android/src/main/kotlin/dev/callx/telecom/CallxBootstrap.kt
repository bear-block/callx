package dev.callx.telecom

import android.content.Context
import android.telecom.DisconnectCause
import androidx.core.telecom.CallsManager
import dev.callx.core.BridgeCapabilities
import dev.callx.core.BridgeRuntime
import dev.callx.core.CallCoordinator
import dev.callx.core.CallRecord
import dev.callx.core.CoordinatorFileStore
import dev.callx.core.OperationReconciliationProbe
import dev.callx.core.ReconciliationOutcome
import dev.callx.core.RecoveredOperationReconciler
import java.io.File
import java.nio.file.Path
import java.util.concurrent.CompletableFuture
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking

/** What the host chooses; everything has a working default. */
class CallxBootstrapConfig(
    /** Rotate on sign-out or account switch; it isolates the checkpoint. */
    val accountGeneration: String = "default",
    /** Application-private checkpoint file; defaults to `files/callx/<accountGeneration>/coordinator.json`. */
    val checkpointPath: Path? = null,
    /** Builds the notification presenter; defaults to [CallStylePresenter]. */
    val presenter: ((Context) -> IncomingCallPresenter)? = null,
    val listener: TelecomIngressListener? = null,
    /** Answer, hold and hangup from a watch or car; defaults to accepting them. */
    val systemActions: TelecomSystemActionHandler? = null,
    /**
     * Media: an explicit adapter wins; otherwise the adapter an installed package declares is used
     * (ADR-0009). Hosts that run media from listener callbacks pass [muteController] instead.
     */
    val media: CallxMediaAdapter? = null,
    val discoverMedia: Boolean = true,
    val muteController: MediaMuteController? = null,
    /** Reports whether operations pending from a previous process were applied; defaults to unavailable. */
    val reconciliationProbe: OperationReconciliationProbe? = null,
    val log: (String) -> Unit = {},
)

/** How media is provided after bootstrap. */
sealed interface CallxMediaStatus {
    data class Adapter(val source: String) : CallxMediaStatus
    /** Mute is applied through the host's controller; media runs from listener callbacks. */
    data object HostControlled : CallxMediaStatus
    /** Calls ring and connect, without media or mute. */
    data class None(val reason: String?) : CallxMediaStatus
}

/**
 * The native pipeline in one call, from `Application.onCreate` before any push can arrive
 * (ADR-0009): Telecom availability, registration, presenter, ingress, sessions, executor,
 * durable coordinator, runtime, media, cold-process recovery and reconciliation. The framework
 * package installs the runtime through [install].
 */
object CallxBootstrap {
    /** The started pipeline. */
    class Started internal constructor(
        val runtime: BridgeRuntime,
        val ingress: TelecomIngress,
        val media: CallxMediaStatus,
        /** The call a previous process left behind, now ended; tell your backend. */
        val recoveredCall: CallRecord?,
    )

    @Volatile var started: Started? = null; private set
    /** Application-lifetime scope for Callx and its media adapter. */
    val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    /**
     * Idempotent per process. Throws [UnsupportedOperationException] on devices without Telecom and
     * [IllegalStateException] when more than one media adapter is installed; report calling as
     * unavailable then. A storage error also throws: never install an empty runtime over it.
     */
    @Synchronized
    fun start(context: Context, config: CallxBootstrapConfig = CallxBootstrapConfig(),
        install: (BridgeRuntime) -> Unit): Started {
        started?.let { return it }
        val app = context.applicationContext
        CallxTelecomAvailability.requireSupported(app)
        val (media, mediaStatus) = resolveMedia(app, config)
        val callsManager = CallsManager(app)
        callsManager.registerAppWithTelecom(CallsManager.CAPABILITY_BASELINE)
        val presenter = config.presenter?.invoke(app) ?: CallStylePresenter(app)
        val ingress = TelecomIngress(scope, presenter, config.listener, media)
        val sessions = CoreTelecomSessionManager(callsManager,
            ingress.systemActions(config.systemActions ?: AcceptingSystemActions), scope, ingress.audioObserver)
        val executor = ingress.executor(TelecomPlatformExecutor(scope, sessions, media ?: NoMute, outgoing = sessions))
        val path = config.checkpointPath
            ?: File(app.filesDir, "callx/${config.accountGeneration}/coordinator.json").toPath()
        val coordinator = CallCoordinator(CoordinatorFileStore(path))
        val runtime = BridgeRuntime(coordinator, executor, BridgeCapabilities(config.accountGeneration,
            durableReplay = true, providerManagedSignaling = false, hold = true, mute = media != null,
            video = ingress.supportsVideo))
        ingress.attach(runtime, sessions)
        val video = media as? CallxVideoAdapter
        android.os.Handler(android.os.Looper.getMainLooper()).post { CallxVideoSurfaces.install(video) }
        // New process only: persist termination and remove stale UI before a push can ring.
        val recovered = runBlocking { ingress.recoverAfterProcessDeath() }
        install(runtime)
        val probe = config.reconciliationProbe ?: OperationReconciliationProbe {
            CompletableFuture.completedFuture(ReconciliationOutcome.Unavailable(System.currentTimeMillis()))
        }
        scope.launch(Dispatchers.IO) { RecoveredOperationReconciler(coordinator, probe).reconcile(System.currentTimeMillis()) }
        return Started(runtime, ingress, mediaStatus, recovered).also { started = it }
    }

    private fun resolveMedia(context: Context, config: CallxBootstrapConfig): Pair<MediaMuteController?, CallxMediaStatus> {
        config.media?.let { return it to CallxMediaStatus.Adapter("explicit") }
        if (config.discoverMedia) {
            when (val found = CallxMediaAdapters.discover(CallxAdapterContext(context, scope, config.log))) {
                is CallxMediaAdapterResolution.Resolved -> return found.adapter to CallxMediaStatus.Adapter(found.source)
                is CallxMediaAdapterResolution.Conflict -> throw IllegalStateException(
                    "More than one Callx media adapter is installed (${found.sources.joinToString()}); keep one.")
                is CallxMediaAdapterResolution.Unavailable -> {
                    config.log("media adapter ${found.source} unavailable: ${found.reason}")
                    return config.muteController to (config.muteController?.let { CallxMediaStatus.HostControlled }
                        ?: CallxMediaStatus.None(found.reason))
                }
                CallxMediaAdapterResolution.None -> Unit
            }
        }
        return config.muteController?.let { it to CallxMediaStatus.HostControlled } ?: (null to CallxMediaStatus.None(null))
    }

    private object AcceptingSystemActions : TelecomSystemActionHandler {
        override suspend fun answer(callId: String, callType: Int) {}
        override suspend fun disconnect(callId: String, cause: DisconnectCause) {}
        override suspend fun setActive(callId: String) {}
        override suspend fun setInactive(callId: String) {}
    }

    /** Without media, mute commands are refused by capability; this is never reached. */
    private object NoMute : MediaMuteController {
        override suspend fun setMuted(callId: String, muted: Boolean) = false
    }
}
