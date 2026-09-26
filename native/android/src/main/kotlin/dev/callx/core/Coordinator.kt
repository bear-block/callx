package dev.callx.core

enum class CallState { incoming, outgoing, connecting, active, held, ended }
enum class CallDirection { incoming, outgoing }
enum class CommandType { startCall, answer, end, setMuted, setHeld }
enum class OperationStatus { pending, applied, rejected, timedOut, unknown }
data class CallRecord(val callId: String, val state: CallState, val muted: Boolean = false,
    val mediaReady: Boolean = false, val endReason: String? = null,
    val displayName: String? = null, val handle: String? = null, val direction: CallDirection? = null,
    val createdAtMs: Long? = null, val acceptedAtMs: Long? = null,
    val mediaConnectedAtMs: Long? = null, val endedAtMs: Long? = null, val ringDeadlineAtMs: Long? = null)
/** A call that ended; its ID is never used again while the record is retained. */
data class TerminalRecord(val callId: String, val reason: String, val endedAtMs: Long)
/** Why an incoming invitation did or did not create a call. */
sealed interface IncomingOutcome {
    data object Accepted : IncomingOutcome
    /** The same call is already live. */
    data object Duplicate : IncomingOutcome
    /** The call already ended; the platform must not ring for it again. */
    data class Ended(val reason: String) : IncomingOutcome
    /** Another call is live. */
    data object Busy : IncomingOutcome
    /** The invitation expired before it arrived. */
    data object Expired : IncomingOutcome
}
data class NativeCommand(val operationId: String, val type: CommandType, val callId: String,
    val value: Boolean? = null, val displayName: String? = null, val handle: String? = null, val deadlineAtMs: Long)
data class NativeOperation(val operationId: String, val status: OperationStatus, val errorCode: String? = null,
    val completedAtMs: Long? = null)
sealed interface Preparation {
    data object Execute : Preparation
    data class Existing(val operation: NativeOperation) : Preparation
    data class Conflict(val operation: NativeOperation) : Preparation
}
data class ObservationCapture(val call: CallRecord?, val watermark: Long, val replay: ReplayOutcome?)

/** Serialized by synchronization until the Android adapter supplies its application coroutine. */
class CallCoordinator private constructor(private val store: CoordinatorStore?, @Suppress("UNUSED_PARAMETER") marker: Unit) {
    companion object {
        const val OPERATION_RETENTION_MS = 86_400_000L; const val OPERATION_QUOTA = 10_000
        const val TERMINAL_RETENTION_MS = 86_400_000L; const val TERMINAL_QUOTA = 1_000
    }
    private var call: CallRecord? = null
    private val terminal = linkedMapOf<String, TerminalRecord>()
    private val pending = mutableMapOf<String, NativeCommand>()
    private val completed = mutableMapOf<String, Pair<NativeCommand, NativeOperation>>()
    private var lastCompletedPruneAt: Long? = null
    private var journal = EventJournal()
    constructor() : this(null, Unit)
    constructor(checkpoint: CoordinatorCheckpoint) : this(null, Unit) { restore(checkpoint) }
    constructor(store: CoordinatorStore) : this(store, Unit) { store.load()?.let(::restore) }
    private fun restore(checkpoint: CoordinatorCheckpoint) {
        call = checkpoint.call
        lastCompletedPruneAt = null
        pending.clear(); completed.clear(); terminal.clear()
        checkpoint.terminal.forEach { terminal[it.callId] = it }
        checkpoint.pending.associateByTo(pending) { it.operationId }
        checkpoint.completed.associateTo(completed) { it.command.operationId to (it.command to it.result) }
        journal = EventJournal(checkpoint.journal ?: JournalCheckpoint())
    }
    @Synchronized fun snapshot() = call
    @Synchronized fun operation(id: String) = completed[id]?.second
        ?: pending[id]?.let { NativeOperation(id, OperationStatus.pending) }
    @Synchronized fun pendingCommands() = pending.values.toList()
    @Synchronized fun checkpoint() = CoordinatorCheckpoint(call = call, pending = pending.values.toList(),
        completed = completed.values.map { CompletedOperation(it.first, it.second) }, journal = journal.state,
        terminal = terminal.values.toList())
    @Synchronized fun replayEvents(after: Long) = journal.replay(after)
    @Synchronized fun acknowledgeEvents(through: Long) = journal.acknowledge(through)
    @Synchronized fun observationCapture(after: Long? = null) = ObservationCapture(
        call, journal.state.nextSequence - 1, after?.let(journal::replay))
    @Synchronized fun terminalRecord(callId: String, nowMs: Long): TerminalRecord? =
        terminal[callId]?.takeIf { nowMs - it.endedAtMs < TERMINAL_RETENTION_MS }
    @Synchronized fun reportIncoming(callId: String, nowMs: Long = 0,
        displayName: String? = null, handle: String? = null,
        ringDeadlineAtMs: Long? = null, expiresAtMs: Long? = null): IncomingOutcome {
        expireRinging(nowMs)
        terminalRecord(callId, nowMs)?.let { return IncomingOutcome.Ended(it.reason) }
        val current = call
        if (current?.callId == callId) {
            return if (current.state == CallState.ended) IncomingOutcome.Ended(current.endReason ?: "failed")
                else IncomingOutcome.Duplicate
        }
        if (expiresAtMs != null && expiresAtMs <= nowMs) return IncomingOutcome.Expired
        if (current != null && current.state != CallState.ended) return IncomingOutcome.Busy
        val deadline = listOfNotNull(ringDeadlineAtMs, expiresAtMs).minOrNull()
        call = CallRecord(callId, CallState.incoming, displayName = displayName, handle = handle,
            direction = CallDirection.incoming, createdAtMs = nowMs, ringDeadlineAtMs = deadline)
        journal.append("callChanged", nowMs, callId, source = EventSource.platform)
        return IncomingOutcome.Accepted
    }
    /** An answer the OS performed itself; the platform action is already complete. */
    @Synchronized fun platformAnswered(callId: String, nowMs: Long): Boolean {
        val current = call ?: return false
        if (current.callId != callId || current.state != CallState.incoming) return false
        call = current.copy(state = CallState.connecting, acceptedAtMs = nowMs, ringDeadlineAtMs = null)
        journal.append("callChanged", nowMs, callId, source = EventSource.platform); return true
    }
    /** A hangup or decline the OS performed itself. Without a reason, incoming calls are declined. */
    @Synchronized fun platformEnded(callId: String, reason: String? = null, nowMs: Long): Boolean {
        val current = call?.takeIf { it.callId == callId && it.state != CallState.ended } ?: return false
        val resolved = reason ?: if (current.state == CallState.incoming) "declined" else "localHangup"
        return end(callId, resolved, EventSource.platform, nowMs)
    }
    /** A mute change the OS made itself, for example from a car or headset. True when state changed. */
    @Synchronized fun platformMuted(callId: String, muted: Boolean, nowMs: Long): Boolean {
        val current = call ?: return false
        if (current.callId != callId || current.muted == muted ||
            current.state == CallState.incoming || current.state == CallState.ended) return false
        call = current.copy(muted = muted)
        journal.append("callChanged", nowMs, callId, source = EventSource.platform); return true
    }
    /** A hold or resume the OS made itself, for example for call waiting. True when state changed. */
    @Synchronized fun platformHeld(callId: String, held: Boolean, nowMs: Long): Boolean {
        val current = call ?: return false
        if (current.callId != callId) return false
        val next = when {
            held && current.state == CallState.active -> CallState.held
            !held && current.state == CallState.held -> CallState.active
            else -> return false
        }
        call = current.copy(state = next)
        journal.append("callChanged", nowMs, callId, source = EventSource.platform); return true
    }
    /** Ends an incoming call whose ring deadline passed; returns its ID. */
    @Synchronized fun expireRinging(nowMs: Long): String? {
        val current = call ?: return null
        val deadline = current.ringDeadlineAtMs ?: return null
        if (current.state != CallState.incoming || deadline > nowMs) return null
        end(current.callId, "unanswered", EventSource.local, nowMs); return current.callId
    }
    @Synchronized fun remoteAnswered(callId: String, nowMs: Long): Boolean {
        val current = call ?: return false
        if (current.callId != callId || current.state != CallState.outgoing) return false
        call = current.copy(state = CallState.connecting, acceptedAtMs = nowMs)
        journal.append("callChanged", nowMs, callId, source = EventSource.signaling); return true
    }
    @Synchronized fun mediaConnected(callId: String, nowMs: Long) {
        val current = call ?: return
        if (current.callId != callId || current.state !in setOf(CallState.connecting, CallState.held)) return
        call = current.copy(state = if (current.state == CallState.held) CallState.held else CallState.active,
            mediaReady = true, mediaConnectedAtMs = nowMs)
        journal.append("callChanged", nowMs, callId, source = EventSource.media)
    }
    /** Ends the live call, or records a tombstone so a later invitation for this ID cannot ring. */
    @Synchronized fun remoteEnded(callId: String, reason: String = "remoteEnded", nowMs: Long = 0): Boolean {
        if (end(callId, reason, EventSource.signaling, nowMs)) return true
        if (call?.callId != callId && terminalRecord(callId, nowMs) == null) recordTerminal(callId, reason, nowMs)
        return false
    }
    private fun end(callId: String, reason: String, source: EventSource, nowMs: Long): Boolean {
        val current = call ?: return false; if (current.callId != callId || current.state == CallState.ended) return false
        call = current.copy(state = CallState.ended, mediaReady = false, endReason = reason, endedAtMs = nowMs,
            ringDeadlineAtMs = null)
        recordTerminal(callId, reason, nowMs)
        journal.append("callChanged", nowMs, callId, source = source)
        pending.filterValues { it.callId == callId }.toMap().forEach { (id, command) ->
            completed[id] = command to NativeOperation(id, OperationStatus.rejected, "invalidState", nowMs); pending.remove(id)
            journal.append("operationCompleted", nowMs, operationId = id, source = source)
        }
        pruneCompleted(nowMs); return true
    }
    private fun recordTerminal(callId: String, reason: String, nowMs: Long) {
        terminal.remove(callId); terminal[callId] = TerminalRecord(callId, reason, nowMs)
        terminal.entries.removeIf { nowMs - it.value.endedAtMs >= TERMINAL_RETENTION_MS }
        while (terminal.size > TERMINAL_QUOTA) terminal.remove(terminal.keys.first())
    }
    @Synchronized fun prepare(command: NativeCommand, nowMs: Long): Preparation {
        expireRinging(nowMs)
        completed[command.operationId]?.let { return if (it.first == command) Preparation.Existing(it.second) else conflict(command.operationId, nowMs) }
        pending[command.operationId]?.let { return if (it == command) Preparation.Existing(NativeOperation(command.operationId, OperationStatus.pending)) else conflict(command.operationId, nowMs) }
        if (command.deadlineAtMs <= nowMs) return finish(command, OperationStatus.timedOut, "deadlineExceeded", nowMs)
        preconditionError(command, nowMs)?.let { return finish(command, OperationStatus.rejected, it, nowMs) }
        pending[command.operationId] = command; return Preparation.Execute
    }
    @Synchronized fun expire(nowMs: Long) {
        pending.filterValues { it.deadlineAtMs <= nowMs }.toMap().forEach { (id, command) ->
            completed[id] = command to NativeOperation(id, OperationStatus.timedOut, "deadlineExceeded", nowMs); pending.remove(id)
            journal.append("operationCompleted", nowMs, operationId = id, source = EventSource.recovery)
        }
        pruneCompleted(nowMs)
    }
    @Synchronized fun completeApplied(operationId: String, nowMs: Long): NativeOperation? {
        val command = pending.remove(operationId) ?: return completed[operationId]?.second
        if (command.deadlineAtMs <= nowMs) {
            val result = finishResult(command, OperationStatus.timedOut, "deadlineExceeded", nowMs)
            journal.append("operationCompleted", nowMs, operationId = operationId); return result
        }
        apply(command, nowMs); val result = finishResult(command, OperationStatus.applied, null, nowMs)
        journal.append("callChanged", nowMs, command.callId); journal.append("operationCompleted", nowMs, operationId = operationId)
        return result
    }
    @Synchronized fun completeRejected(operationId: String, errorCode: String, nowMs: Long): NativeOperation? {
        val command = pending.remove(operationId) ?: return completed[operationId]?.second
        val result = finishResult(command, OperationStatus.rejected, errorCode, nowMs)
        journal.append("operationCompleted", nowMs, operationId = operationId); return result
    }
    @Synchronized fun completeUnknown(operationId: String, errorCode: String, nowMs: Long): NativeOperation? {
        val command = pending.remove(operationId) ?: return completed[operationId]?.second
        val result = finishResult(command, OperationStatus.unknown, errorCode, nowMs)
        journal.append("operationCompleted", nowMs, operationId = operationId); return result
    }
    @Synchronized fun completeTimedOut(operationId: String, nowMs: Long): NativeOperation? {
        val command = pending.remove(operationId) ?: return completed[operationId]?.second
        val result = finishResult(command, OperationStatus.timedOut, "deadlineExceeded", nowMs)
        journal.append("operationCompleted", nowMs, operationId = operationId); return result
    }
    private fun preconditionError(command: NativeCommand, nowMs: Long): String? {
        if (command.type == CommandType.startCall) {
            if (command.displayName.isNullOrEmpty() || command.handle.isNullOrEmpty()) return "invalidArgument"
            // A call ID identifies one session and is never reused.
            if (call?.callId == command.callId || terminalRecord(command.callId, nowMs) != null) return "invalidState"
            return if (call == null || call?.state == CallState.ended) null else "busy"
        }
        val current = call ?: return "callNotFound"; if (current.callId != command.callId) return "callNotFound"
        if (current.state == CallState.ended) return "invalidState"
        return when (command.type) {
            CommandType.answer -> if (current.state == CallState.incoming) null else "invalidState"
            CommandType.end -> null
            CommandType.setMuted, CommandType.setHeld -> if (command.value == null) "invalidArgument"
                else if (current.state in setOf(CallState.active, CallState.held)) null else "invalidState"
            CommandType.startCall -> null
        }
    }
    private fun apply(command: NativeCommand, nowMs: Long) {
        if (command.type == CommandType.startCall) {
            call = CallRecord(command.callId, CallState.outgoing, displayName = command.displayName,
                handle = command.handle, direction = CallDirection.outgoing, createdAtMs = nowMs)
            return
        }
        val current = call ?: return
        call = when (command.type) {
            CommandType.answer -> current.copy(state = CallState.connecting, acceptedAtMs = nowMs, ringDeadlineAtMs = null)
            CommandType.end -> {
                val reason = if (current.state == CallState.incoming) "declined" else "localHangup"
                recordTerminal(current.callId, reason, nowMs)
                current.copy(state = CallState.ended, mediaReady = false, endReason = reason, endedAtMs = nowMs,
                    ringDeadlineAtMs = null)
            }
            CommandType.setMuted -> current.copy(muted = command.value!!)
            CommandType.setHeld -> current.copy(state = if (command.value!!) CallState.held else CallState.active)
            CommandType.startCall -> current
        }
    }
    private fun finish(command: NativeCommand, status: OperationStatus, error: String, nowMs: Long): Preparation.Existing {
        val result = finishResult(command, status, error, nowMs)
        journal.append("operationCompleted", nowMs, operationId = command.operationId)
        return Preparation.Existing(result)
    }
    private fun finishResult(command: NativeCommand, status: OperationStatus, error: String?, nowMs: Long): NativeOperation {
        val result = NativeOperation(command.operationId, status, error, nowMs)
        completed[command.operationId] = command to result; pruneCompleted(nowMs); return result
    }
    private fun conflict(id: String, nowMs: Long) =
        Preparation.Conflict(NativeOperation(id, OperationStatus.rejected, "conflict", nowMs))
    private fun pruneCompleted(nowMs: Long) {
        val last = lastCompletedPruneAt
        if (last == null || nowMs < last || nowMs - last >= OPERATION_RETENTION_MS) {
            completed.entries.removeIf { (_, pair) ->
                pair.second.completedAtMs?.let { nowMs - it >= OPERATION_RETENTION_MS } ?: true
            }
            lastCompletedPruneAt = nowMs
        }
        if (completed.size > OPERATION_QUOTA) completed.entries
            .sortedBy { it.value.second.completedAtMs }.take(completed.size - OPERATION_QUOTA)
            .forEach { completed.remove(it.key) }
    }
    private fun persistOrRestore(before: CoordinatorCheckpoint) {
        try { store?.save(checkpoint()) } catch (error: Throwable) { restore(before); throw error }
    }
    @Synchronized fun durablePrepare(command: NativeCommand, nowMs: Long): Preparation {
        val before = checkpoint(); val result = prepare(command, nowMs); persistOrRestore(before); return result
    }
    @Synchronized fun durableReportIncoming(callId: String, nowMs: Long,
        displayName: String? = null, handle: String? = null,
        ringDeadlineAtMs: Long? = null, expiresAtMs: Long? = null): IncomingOutcome {
        val before = checkpoint()
        val outcome = reportIncoming(callId, nowMs, displayName, handle, ringDeadlineAtMs, expiresAtMs)
        persistOrRestore(before); return outcome
    }
    @Synchronized fun durablePlatformAnswered(callId: String, nowMs: Long): Boolean {
        val before = checkpoint(); val result = platformAnswered(callId, nowMs); persistOrRestore(before); return result
    }
    @Synchronized fun durablePlatformEnded(callId: String, reason: String? = null, nowMs: Long): Boolean {
        val before = checkpoint(); val result = platformEnded(callId, reason, nowMs); persistOrRestore(before); return result
    }
    @Synchronized fun durablePlatformMuted(callId: String, muted: Boolean, nowMs: Long): Boolean {
        val before = checkpoint(); val result = platformMuted(callId, muted, nowMs); persistOrRestore(before); return result
    }
    @Synchronized fun durablePlatformHeld(callId: String, held: Boolean, nowMs: Long): Boolean {
        val before = checkpoint(); val result = platformHeld(callId, held, nowMs); persistOrRestore(before); return result
    }
    @Synchronized fun durableExpireRinging(nowMs: Long): String? {
        val before = checkpoint(); val result = expireRinging(nowMs); persistOrRestore(before); return result
    }
    @Synchronized fun durableRemoteAnswered(callId: String, nowMs: Long): Boolean {
        val before = checkpoint(); val result = remoteAnswered(callId, nowMs); persistOrRestore(before); return result
    }
    @Synchronized fun durableMediaConnected(callId: String, nowMs: Long) {
        val before = checkpoint(); mediaConnected(callId, nowMs); persistOrRestore(before)
    }
    @Synchronized fun durableRemoteEnded(callId: String, reason: String = "remoteEnded", nowMs: Long): Boolean {
        val before = checkpoint(); val result = remoteEnded(callId, reason, nowMs); persistOrRestore(before); return result
    }
    @Synchronized fun durableCompleteApplied(operationId: String, nowMs: Long): NativeOperation? {
        val before = checkpoint(); val result = completeApplied(operationId, nowMs); persistOrRestore(before); return result
    }
    @Synchronized fun durableCompleteRejected(operationId: String, errorCode: String, nowMs: Long): NativeOperation? {
        val before = checkpoint(); val result = completeRejected(operationId, errorCode, nowMs)
        persistOrRestore(before); return result
    }
    @Synchronized fun durableCompleteUnknown(operationId: String, errorCode: String, nowMs: Long): NativeOperation? {
        val before = checkpoint(); val result = completeUnknown(operationId, errorCode, nowMs)
        persistOrRestore(before); return result
    }
    @Synchronized fun durableCompleteTimedOut(operationId: String, nowMs: Long): NativeOperation? {
        val before = checkpoint(); val result = completeTimedOut(operationId, nowMs)
        persistOrRestore(before); return result
    }
    @Synchronized fun durableExpire(nowMs: Long) {
        val before = checkpoint(); expire(nowMs); persistOrRestore(before)
    }
    @Synchronized fun durableAcknowledgeEvents(through: Long) {
        val before = checkpoint(); acknowledgeEvents(through); persistOrRestore(before)
    }
}
