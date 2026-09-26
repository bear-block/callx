package dev.callx.telecom

import android.telecom.DisconnectCause
import androidx.core.telecom.CallEndpointCompat
import dev.callx.core.BridgeRuntime
import dev.callx.core.CommandType
import dev.callx.core.IncomingOutcome
import dev.callx.core.IncomingReportDecision
import dev.callx.core.IncomingReportPolicy
import dev.callx.core.Invitation
import dev.callx.core.InvitationCodec
import dev.callx.core.InvitationViolation
import dev.callx.core.NativeCommand
import dev.callx.core.OperationStatus
import dev.callx.core.PlatformCommandExecutor
import dev.callx.core.PlatformOutcome
import java.util.concurrent.ConcurrentHashMap
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.delay
import kotlinx.coroutines.future.await
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeoutOrNull

/** Shows and removes the system notification for a call. */
interface IncomingCallPresenter {
    fun showIncoming(invitation: Invitation)
    fun showOutgoing(callId: String, displayName: String)
    fun showOngoing(callId: String)
    fun dismiss(callId: String)
}

/** Host callbacks for the library-owned call path. All methods have empty defaults. */
interface TelecomIngressListener {
    /**
     * FCM delivered a Callx message. `priority` below `originalPriority` means FCM deprioritized
     * it (RemoteMessage.PRIORITY_HIGH is 1, PRIORITY_NORMAL is 2). [callId] is null when undecodable.
     */
    fun onPushReceived(callId: String?, priority: Int?, originalPriority: Int?) {}
    /** The call now rings. Connect signaling and prepare media. */
    fun onInvitationAccepted(invitation: Invitation) {}
    /**
     * No call rings. [invitation] is null when the payload could not be decoded; [outcome] is null
     * when the call could not be recorded or registered with Telecom.
     */
    fun onInvitationRejected(invitation: Invitation?, outcome: IncomingOutcome?) {}
    /** The user answered from the notification. Tell your backend and start media. */
    fun onUserAnswered(callId: String) {}
    /** The user declined or hung up from the notification. */
    fun onUserEnded(callId: String) {}
    fun onRingTimedOut(callId: String) {}
    /** Audio routes changed; offer them in your call UI and switch with [TelecomIngress.requestAudioEndpoint]. */
    fun onAudioEndpointsChanged(callId: String, current: CallEndpointCompat, available: List<CallEndpointCompat>) {}
}

/**
 * Owns the Android call path in BYO signaling mode: decode → coordinator outcome → Telecom
 * registration → notification, the ring deadline, and a notification that follows every command.
 * It declares no FirebaseMessagingService; forward messages from yours with [handlePush]. Do not
 * create it when a provider SDK owns Telecom.
 */
class TelecomIngress(
    private val scope: CoroutineScope,
    private val presenter: IncomingCallPresenter,
    private val listener: TelecomIngressListener? = null,
    /** Applies mute changes that other surfaces make (car, headset, watch) to your media. */
    private val media: MediaMuteController? = null,
    private val ringTimeoutMs: Long = 45_000,
    /** Telecom tears a call down if a system callback takes longer than five seconds. */
    private val systemActionBudgetMs: Long = 4_000,
    private val nowMs: () -> Long = System::currentTimeMillis,
) {
    companion object {
        const val ACTION_ANSWER = "dev.callx.telecom.ANSWER"
        const val ACTION_DECLINE = "dev.callx.telecom.DECLINE"
        const val ACTION_HANG_UP = "dev.callx.telecom.HANG_UP"
        const val EXTRA_CALL_ID = "dev.callx.telecom.CALL_ID"
        /** How long [handlePush] waits for the call to ring, within FCM's processing window. */
        const val PUSH_WAIT_MS = 8_000L
        /** The attached ingress that receives notification buttons. */
        @Volatile internal var active: TelecomIngress? = null
    }

    private lateinit var runtime: BridgeRuntime
    private lateinit var sessions: IncomingTelecomSessions
    private val ringJobs = ConcurrentHashMap<String, Job>()

    /** Pass the result to [CoreTelecomSessionManager] so system-surface actions reach the coordinator. */
    fun systemActions(host: TelecomSystemActionHandler): TelecomSystemActionHandler = object : TelecomSystemActionHandler {
        override suspend fun answer(callId: String, callType: Int) {
            // Throwing tells Telecom the answer failed; record it only after the host accepted it.
            withinBudget("answer") { host.answer(callId, callType) }
            cancelRing(callId); runtime.platformAnswered(callId); presenter.showOngoing(callId)
        }
        override suspend fun disconnect(callId: String, cause: DisconnectCause) {
            // A hangup from another surface always succeeds; the host cleans up afterwards.
            cancelRing(callId); runtime.platformEnded(callId, reasonFor(cause.code)); presenter.dismiss(callId)
            scope.launch { host.disconnect(callId, cause) }
        }
        override suspend fun setActive(callId: String) {
            withinBudget("setActive") { host.setActive(callId) }
            runtime.platformHeld(callId, held = false)
        }
        override suspend fun setInactive(callId: String) {
            withinBudget("setInactive") { host.setInactive(callId) }
            runtime.platformHeld(callId, held = true)
        }
    }

    /** Pass to [CoreTelecomSessionManager] so mute and audio routes from other surfaces are handled. */
    val audioObserver: TelecomCallAudioObserver = object : TelecomCallAudioObserver {
        override suspend fun onMuteChanged(callId: String, muted: Boolean) = applySystemMute(callId, muted)
        override fun onEndpointsChanged(callId: String, current: CallEndpointCompat, available: List<CallEndpointCompat>) {
            listener?.onAudioEndpointsChanged(callId, current, available)
        }
    }

    /** Wrap your [TelecomPlatformExecutor] so the notification follows commands from Dart/JS and native UI. */
    fun executor(inner: PlatformCommandExecutor) = PlatformCommandExecutor { command ->
        inner.perform(command).whenComplete { outcome, _ ->
            if (outcome is PlatformOutcome.Applied) runCatching { commandApplied(command) }
        }
    }

    /** Completes construction once the runtime exists; the runtime's executor needs [sessions] first. */
    fun attach(runtime: BridgeRuntime, sessions: IncomingTelecomSessions) {
        this.runtime = runtime; this.sessions = sessions; active = this
    }

    /**
     * Call from `FirebaseMessagingService.onMessageReceived`, which runs on a background thread,
     * with `message.data`, `message.priority` and `message.originalPriority`. It returns once the
     * call rings or is rejected (at most [timeoutMs]), so the notification is posted inside FCM's
     * processing window. Returns false when the message is not a Callx invitation.
     */
    fun handlePush(data: Map<String, String>, priority: Int? = null, originalPriority: Int? = null,
        timeoutMs: Long = PUSH_WAIT_MS): Boolean {
        if (!data.containsKey(InvitationCodec.PAYLOAD_KEY)) return false
        val invitation = try { InvitationCodec.decodeData(data) } catch (_: InvitationViolation) { null }
        listener?.onPushReceived(invitation?.callId, priority, originalPriority)
        // The work runs in the application scope, so it finishes even if waiting times out.
        val work = scope.async { process(invitation) }
        runBlocking { withTimeoutOrNull(timeoutMs) { work.await() } }
        return true
    }

    /** Handles an invitation that arrived over signaling while the app runs. */
    suspend fun handleInvitation(invitation: Invitation): IncomingOutcome? = process(invitation)

    /** Ends the call for a remote terminal event, or records it so a late invitation cannot ring. */
    suspend fun remoteEnded(callId: String, reason: String = "remoteEnded") {
        val ended = runtime.remoteEnded(callId, reason)
        cancelRing(callId); presenter.dismiss(callId)
        if (ended) sessions.resolve(callId)?.disconnect(causeFor(reason))
    }

    /** Records that the remote party accepted an outgoing call and makes the Telecom call active. */
    suspend fun remoteAnswered(callId: String) {
        // setHeld(false) is CallControlScope.setActive for a Core-Telecom call.
        if (runtime.remoteAnswered(callId)) sessions.resolve(callId)?.setHeld(false)
    }

    /** Routes call audio to an endpoint reported by [TelecomIngressListener.onAudioEndpointsChanged]. */
    suspend fun requestAudioEndpoint(callId: String, endpoint: CallEndpointCompat): Boolean =
        sessions.resolve(callId)?.requestEndpoint(endpoint) == TelecomActionResult.Applied

    internal fun onNotificationAction(callId: String, action: String) {
        scope.launch {
            when (action) {
                ACTION_ANSWER -> {
                    val operation = runtime.executeNative(CommandType.answer, callId).await()
                    if (operation.status == OperationStatus.applied) listener?.onUserAnswered(callId)
                }
                ACTION_DECLINE, ACTION_HANG_UP -> {
                    val operation = runtime.executeNative(CommandType.end, callId).await()
                    if (operation.status == OperationStatus.applied) listener?.onUserEnded(callId)
                }
            }
        }
    }

    private fun commandApplied(command: NativeCommand) {
        when (command.type) {
            CommandType.answer -> { cancelRing(command.callId); presenter.showOngoing(command.callId) }
            CommandType.end -> { cancelRing(command.callId); presenter.dismiss(command.callId) }
            // Core-Telecom requires a notification within five seconds of adding any call.
            CommandType.startCall -> presenter.showOutgoing(command.callId, command.displayName ?: command.callId)
            CommandType.setMuted, CommandType.setHeld -> Unit
        }
    }

    private suspend fun process(invitation: Invitation?): IncomingOutcome? {
        if (invitation == null) { listener?.onInvitationRejected(null, null); return null }
        val now = nowMs()
        val outcome = try {
            runtime.reportIncoming(invitation.callId, invitation.displayName, invitation.handle, now,
                ringDeadlineAtMs = now + ringTimeoutMs, expiresAtMs = invitation.expiresAtMs)
        } catch (_: Exception) {
            listener?.onInvitationRejected(invitation, null); return null
        }
        if (IncomingReportPolicy.decide(outcome, mustReport = false) != IncomingReportDecision.Ring) {
            IncomingReportPolicy.tombstoneReason(outcome)?.let { runtime.remoteEnded(invitation.callId, it) }
            listener?.onInvitationRejected(invitation, outcome); return outcome
        }
        if (sessions.reportIncoming(invitation.callId, invitation.displayName, invitation.handle) != TelecomActionResult.Applied) {
            runtime.platformEnded(invitation.callId, "failed")
            listener?.onInvitationRejected(invitation, null); return outcome
        }
        // Posting after addCall lets Android show it even when notifications are blocked.
        presenter.showIncoming(invitation)
        scheduleRing(invitation.callId, listOfNotNull(now + ringTimeoutMs, invitation.expiresAtMs).min())
        listener?.onInvitationAccepted(invitation)
        return outcome
    }

    private suspend fun applySystemMute(callId: String, muted: Boolean) {
        if (!runtime.platformMuted(callId, muted)) return
        // Keep the recorded state truthful if the media engine cannot follow.
        if (media?.setMuted(callId, muted) == false) runtime.platformMuted(callId, !muted)
    }

    private suspend fun withinBudget(action: String, block: suspend () -> Unit) {
        withTimeoutOrNull(systemActionBudgetMs) { block() }
            ?: throw IllegalStateException("Host did not finish $action within $systemActionBudgetMs ms")
    }

    private fun scheduleRing(callId: String, deadline: Long) {
        val job = scope.launch {
            delay((deadline - nowMs()).coerceAtLeast(0))
            ringJobs.remove(callId)
            if (runtime.expireRinging() != callId) return@launch
            sessions.resolve(callId)?.disconnect(DisconnectCause.MISSED)
            presenter.dismiss(callId); listener?.onRingTimedOut(callId)
        }
        ringJobs.put(callId, job)?.cancel()
    }
    private fun cancelRing(callId: String) { ringJobs.remove(callId)?.cancel() }

    private fun reasonFor(code: Int): String? = when (code) {
        DisconnectCause.REJECTED -> "declined"
        DisconnectCause.MISSED -> "unanswered"
        DisconnectCause.REMOTE -> "remoteEnded"
        else -> null
    }
    /** CallControlScope.disconnect accepts only LOCAL, REMOTE, REJECTED and MISSED. */
    private fun causeFor(reason: String) = if (reason == "unanswered") DisconnectCause.MISSED else DisconnectCause.REMOTE
}
