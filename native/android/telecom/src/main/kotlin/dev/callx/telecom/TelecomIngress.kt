package dev.callx.telecom

import android.telecom.DisconnectCause
import androidx.core.telecom.CallEndpointCompat
import dev.callx.core.BridgeRuntime
import dev.callx.core.CallState
import dev.callx.core.CallRecord
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
    /** Stop the ringtone while leaving the incoming notification visible. */
    fun silenceIncoming(callId: String) {}
    fun showOutgoing(callId: String, displayName: String)
    /** [answeredAtMs] is when the call was answered on either side; null while an outgoing call still rings. */
    fun showOngoing(callId: String, answeredAtMs: Long?)
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
    /**
     * The call was answered, from any surface or by the remote side of an outgoing call. Start media
     * here. Runs under the ingress lock: return quickly and connect asynchronously.
     */
    fun onCallAnswered(callId: String) {}
    /** The call ended for any reason, including one that never rang. Stop media; also runs under the lock. */
    fun onCallEnded(callId: String) {}
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
    private data class Registration(var answered: Boolean = false, var endedReason: String? = null)
    private val registrations = mutableMapOf<String, Registration>()
    private val presentationLock = Any()
    private val ringJobs = ConcurrentHashMap<String, Job>()

    /** Pass the result to [CoreTelecomSessionManager] so system-surface actions reach the coordinator. */
    fun systemActions(host: TelecomSystemActionHandler): TelecomSystemActionHandler = object : TelecomSystemActionHandler {
        override suspend fun answer(callId: String, callType: Int) {
            // Throwing tells Telecom the answer failed; record it only after the host accepted it.
            withinBudget("answer") { host.answer(callId, callType) }
            synchronized(presentationLock) {
                if (runtime.platformAnswered(callId)) {
                    cancelRing(callId); presentAnswered(callId, answeredAt(callId))
                }
            }
        }
        override suspend fun disconnect(callId: String, cause: DisconnectCause) {
            // A hangup from another surface always succeeds; the host cleans up afterwards.
            synchronized(presentationLock) {
                cancelRing(callId); runtime.platformEnded(callId, reasonFor(cause.code)); dismissCall(callId)
            }
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
        val ended = synchronized(presentationLock) {
            runtime.remoteEnded(callId, reason).also {
                cancelRing(callId); dismissCall(callId)
            }
        }
        if (ended) sessions.resolve(callId)?.disconnect(causeFor(reason))
    }

    /** Cold-process bootstrap only. Persist termination before cleaning up platform state.
     * Never call for a Dart/JS engine restart in the same process. */
    suspend fun recoverAfterProcessDeath(): CallRecord? {
        val recovered = synchronized(presentationLock) {
            runtime.recoverAfterProcessDeath()?.also {
                cancelRing(it.callId); dismissCall(it.callId)
            }
        }
        if (recovered != null) sessions.resolve(recovered.callId)?.disconnect(causeFor(recovered.endReason ?: "failed"))
        return recovered
    }

    /** Records that the remote party accepted an outgoing call and makes the Telecom call active. */
    suspend fun remoteAnswered(callId: String) {
        val answered = synchronized(presentationLock) {
            runtime.remoteAnswered(callId).also { if (it) presentAnswered(callId, answeredAt(callId)) }
        }
        // setHeld(false) is CallControlScope.setActive for a Core-Telecom call.
        if (answered) sessions.resolve(callId)?.setHeld(false)
    }

    /** Routes call audio to an endpoint reported by [TelecomIngressListener.onAudioEndpointsChanged]. */
    suspend fun requestAudioEndpoint(callId: String, endpoint: CallEndpointCompat): Boolean =
        sessions.resolve(callId)?.requestEndpoint(endpoint) == TelecomActionResult.Applied

    /** True while [callId] is the call that is ringing; the incoming call screen closes otherwise. */
    internal fun isRinging(callId: String): Boolean =
        runtime.currentCall()?.let { it.callId == callId && it.state == CallState.incoming } == true

    /** A volume-down event in the native incoming screen silences this call's ringtone. */
    fun silenceIncoming(callId: String) = synchronized(presentationLock) {
        if (isRinging(callId)) presenter.silenceIncoming(callId)
    }

    /** True while [callId] has not ended. */
    internal fun isLive(callId: String): Boolean =
        runtime.currentCall()?.let { it.callId == callId && it.state != CallState.ended } == true

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

    private fun commandApplied(command: NativeCommand) = synchronized(presentationLock) {
        when (command.type) {
            CommandType.answer -> {
                registrations[command.callId]?.answered = true
                // The coordinator commits acceptedAtMs after the executor reports Applied, i.e. right now.
                cancelRing(command.callId); presentAnswered(command.callId, answeredAt(command.callId) ?: nowMs())
            }
            CommandType.end -> {
                registrations[command.callId]?.endedReason =
                    if (runtime.currentCall()?.state == CallState.incoming) "declined" else "localHangup"
                cancelRing(command.callId); dismissCall(command.callId)
            }
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
        synchronized(presentationLock) { registrations[invitation.callId] = Registration() }
        if (sessions.reportIncoming(invitation.callId, invitation.displayName, invitation.handle) != TelecomActionResult.Applied) {
            synchronized(presentationLock) { registrations.remove(invitation.callId) }
            runtime.platformEnded(invitation.callId, "failed")
            listener?.onInvitationRejected(invitation, null); return outcome
        }
        // Registration suspends. A cancel, system answer or deadline may have won meanwhile.
        // Serialize presentation with terminal actions so a late completion cannot re-post UI.
        val terminal = synchronized(presentationLock) {
            val current = runtime.currentCall()
            if (current?.callId == invitation.callId && current.state == CallState.incoming) {
                runtime.expireRinging(callId = invitation.callId)
            }
            val latest = runtime.currentCall()
            val registration = registrations.remove(invitation.callId)
            if (latest?.callId != invitation.callId || latest.state == CallState.ended || registration?.endedReason != null) {
                val reason = latest?.takeIf { it.callId == invitation.callId }?.endReason
                    ?: registration?.endedReason ?: "failed"
                cancelRing(invitation.callId); dismissCall(invitation.callId)
                IncomingOutcome.Ended(reason)
            } else {
                if (latest.state == CallState.incoming && registration?.answered != true) {
                    presenter.showIncoming(invitation)
                    scheduleRing(invitation.callId, requireNotNull(latest.ringDeadlineAtMs))
                } else {
                    // The system answered while registration was completing; that path already
                    // told the listener.
                    presenter.showOngoing(invitation.callId, answeredAt(invitation.callId))
                }
                listener?.onInvitationAccepted(invitation)
                null
            }
        }
        if (terminal != null) {
            sessions.resolve(invitation.callId)?.disconnect(causeFor(terminal.reason))
            listener?.onInvitationRejected(invitation, terminal)
            return terminal
        }
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
            val expired = synchronized(presentationLock) {
                if (runtime.currentCall()?.callId != callId) false
                else (runtime.expireRinging(callId = callId) == callId).also { ended ->
                    if (ended) {
                        ringJobs.remove(callId)
                        dismissCall(callId); listener?.onRingTimedOut(callId)
                    }
                }
            }
            if (expired) sessions.resolve(callId)?.disconnect(DisconnectCause.MISSED)
        }
        ringJobs.put(callId, job)?.cancel()
    }
    private fun cancelRing(callId: String) { ringJobs.remove(callId)?.cancel() }
    /** Every terminal path ends here, whichever presenter the host uses. */
    private fun dismissCall(callId: String) {
        presenter.dismiss(callId); CallxIncomingCallActivity.callEnded(callId); CallxLockScreen.release()
        listener?.onCallEnded(callId)
    }
    private fun presentAnswered(callId: String, answeredAtMs: Long?) {
        presenter.showOngoing(callId, answeredAtMs); listener?.onCallAnswered(callId)
    }
    private fun answeredAt(callId: String) = runtime.currentCall()?.takeIf { it.callId == callId }?.acceptedAtMs

    private fun reasonFor(code: Int): String? = when (code) {
        DisconnectCause.REJECTED -> "declined"
        DisconnectCause.MISSED -> "unanswered"
        DisconnectCause.REMOTE -> "remoteEnded"
        else -> null
    }
    /** CallControlScope.disconnect accepts only LOCAL, REMOTE, REJECTED and MISSED. */
    private fun causeFor(reason: String) = if (reason == "unanswered") DisconnectCause.MISSED else DisconnectCause.REMOTE
}
