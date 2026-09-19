package dev.callx.core

enum class CallState { incoming, outgoing, connecting, active, held, ended }
enum class CommandType { startCall, answer, end, setMuted, setHeld }
enum class OperationStatus { pending, applied, rejected, timedOut, unknown }
data class CallRecord(val callId: String, val state: CallState, val muted: Boolean = false,
    val mediaReady: Boolean = false, val endReason: String? = null)
data class NativeCommand(val operationId: String, val type: CommandType, val callId: String,
    val value: Boolean? = null, val deadlineAtMs: Long)
data class NativeOperation(val operationId: String, val status: OperationStatus, val errorCode: String? = null)
sealed interface Preparation {
    data object Execute : Preparation
    data class Existing(val operation: NativeOperation) : Preparation
    data class Conflict(val operation: NativeOperation) : Preparation
}

/** Serialized by synchronization until the Android adapter supplies its application coroutine. */
class CallCoordinator private constructor(private val store: CoordinatorStore?, @Suppress("UNUSED_PARAMETER") marker: Unit) {
    private var call: CallRecord? = null
    private val pending = mutableMapOf<String, NativeCommand>()
    private val completed = mutableMapOf<String, Pair<NativeCommand, NativeOperation>>()
    private var journal = EventJournal()
    constructor() : this(null, Unit)
    constructor(checkpoint: CoordinatorCheckpoint) : this(null, Unit) { restore(checkpoint) }
    constructor(store: CoordinatorStore) : this(store, Unit) { store.load()?.let(::restore) }
    private fun restore(checkpoint: CoordinatorCheckpoint) {
        call = checkpoint.call
        pending.clear(); completed.clear()
        checkpoint.pending.associateByTo(pending) { it.operationId }
        checkpoint.completed.associateTo(completed) { it.command.operationId to (it.command to it.result) }
        journal = EventJournal(checkpoint.journal ?: JournalCheckpoint())
    }
    @Synchronized fun snapshot() = call
    @Synchronized fun operation(id: String) = completed[id]?.second
        ?: pending[id]?.let { NativeOperation(id, OperationStatus.pending) }
    @Synchronized fun pendingCommands() = pending.values.toList()
    @Synchronized fun checkpoint() = CoordinatorCheckpoint(call = call, pending = pending.values.toList(),
        completed = completed.values.map { CompletedOperation(it.first, it.second) }, journal = journal.state)
    @Synchronized fun replayEvents(after: Long) = journal.replay(after)
    @Synchronized fun acknowledgeEvents(through: Long) = journal.acknowledge(through)
    @Synchronized fun reportIncoming(callId: String, nowMs: Long = 0) {
        if (call == null || call?.state == CallState.ended) {
            call = CallRecord(callId, CallState.incoming); journal.append("callChanged", nowMs, callId)
        }
    }
    @Synchronized fun remoteEnded(callId: String, reason: String = "remoteEnded", nowMs: Long = 0) {
        val current = call ?: return; if (current.callId != callId || current.state == CallState.ended) return
        call = current.copy(state = CallState.ended, mediaReady = false, endReason = reason)
        journal.append("callChanged", nowMs, callId)
        pending.filterValues { it.callId == callId }.toMap().forEach { (id, command) ->
            completed[id] = command to NativeOperation(id, OperationStatus.rejected, "invalidState"); pending.remove(id)
            journal.append("operationCompleted", nowMs, operationId = id)
        }
    }
    @Synchronized fun prepare(command: NativeCommand, nowMs: Long): Preparation {
        completed[command.operationId]?.let { return if (it.first == command) Preparation.Existing(it.second) else conflict(command.operationId) }
        pending[command.operationId]?.let { return if (it == command) Preparation.Existing(NativeOperation(command.operationId, OperationStatus.pending)) else conflict(command.operationId) }
        if (command.deadlineAtMs <= nowMs) return finish(command, OperationStatus.timedOut, "deadlineExceeded", nowMs)
        preconditionError(command)?.let { return finish(command, OperationStatus.rejected, it, nowMs) }
        pending[command.operationId] = command; return Preparation.Execute
    }
    @Synchronized fun expire(nowMs: Long) {
        pending.filterValues { it.deadlineAtMs <= nowMs }.toMap().forEach { (id, command) ->
            completed[id] = command to NativeOperation(id, OperationStatus.timedOut, "deadlineExceeded"); pending.remove(id)
            journal.append("operationCompleted", nowMs, operationId = id)
        }
    }
    @Synchronized fun completeApplied(operationId: String, nowMs: Long): NativeOperation? {
        val command = pending.remove(operationId) ?: return completed[operationId]?.second
        if (command.deadlineAtMs <= nowMs) {
            val result = finishResult(command, OperationStatus.timedOut, "deadlineExceeded")
            journal.append("operationCompleted", nowMs, operationId = operationId); return result
        }
        apply(command); val result = finishResult(command, OperationStatus.applied, null)
        journal.append("callChanged", nowMs, command.callId); journal.append("operationCompleted", nowMs, operationId = operationId)
        return result
    }
    @Synchronized fun completeRejected(operationId: String, errorCode: String, nowMs: Long): NativeOperation? {
        val command = pending.remove(operationId) ?: return completed[operationId]?.second
        val result = finishResult(command, OperationStatus.rejected, errorCode)
        journal.append("operationCompleted", nowMs, operationId = operationId); return result
    }
    @Synchronized fun completeUnknown(operationId: String, errorCode: String, nowMs: Long): NativeOperation? {
        val command = pending.remove(operationId) ?: return completed[operationId]?.second
        val result = finishResult(command, OperationStatus.unknown, errorCode)
        journal.append("operationCompleted", nowMs, operationId = operationId); return result
    }
    private fun preconditionError(command: NativeCommand): String? {
        val current = call ?: return "callNotFound"; if (current.callId != command.callId) return "callNotFound"
        if (current.state == CallState.ended) return "invalidState"
        return when (command.type) {
            CommandType.answer -> if (current.state == CallState.incoming) null else "invalidState"
            CommandType.end -> null
            CommandType.setMuted, CommandType.setHeld -> if (command.value == null) "invalidArgument"
                else if (current.state in setOf(CallState.active, CallState.held)) null else "invalidState"
            CommandType.startCall -> "unsupported"
        }
    }
    private fun apply(command: NativeCommand) {
        val current = call ?: return
        call = when (command.type) {
            CommandType.answer -> current.copy(state = CallState.connecting)
            CommandType.end -> current.copy(state = CallState.ended, mediaReady = false,
                endReason = if (current.state == CallState.incoming) "declined" else "localHangup")
            CommandType.setMuted -> current.copy(muted = command.value!!)
            CommandType.setHeld -> current.copy(state = if (command.value!!) CallState.held else CallState.active)
            CommandType.startCall -> current
        }
    }
    private fun finish(command: NativeCommand, status: OperationStatus, error: String, nowMs: Long): Preparation.Existing {
        val result = finishResult(command, status, error)
        journal.append("operationCompleted", nowMs, operationId = command.operationId)
        return Preparation.Existing(result)
    }
    private fun finishResult(command: NativeCommand, status: OperationStatus, error: String?): NativeOperation {
        val result = NativeOperation(command.operationId, status, error); completed[command.operationId] = command to result; return result
    }
    private fun conflict(id: String) = Preparation.Conflict(NativeOperation(id, OperationStatus.rejected, "conflict"))
    private fun persistOrRestore(before: CoordinatorCheckpoint) {
        try { store?.save(checkpoint()) } catch (error: Throwable) { restore(before); throw error }
    }
    @Synchronized fun durablePrepare(command: NativeCommand, nowMs: Long): Preparation {
        val before = checkpoint(); val result = prepare(command, nowMs); persistOrRestore(before); return result
    }
    @Synchronized fun durableReportIncoming(callId: String, nowMs: Long) {
        val before = checkpoint(); reportIncoming(callId, nowMs); persistOrRestore(before)
    }
    @Synchronized fun durableRemoteEnded(callId: String, reason: String = "remoteEnded", nowMs: Long) {
        val before = checkpoint(); remoteEnded(callId, reason, nowMs); persistOrRestore(before)
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
    @Synchronized fun durableExpire(nowMs: Long) {
        val before = checkpoint(); expire(nowMs); persistOrRestore(before)
    }
    @Synchronized fun durableAcknowledgeEvents(through: Long) {
        val before = checkpoint(); acknowledgeEvents(through); persistOrRestore(before)
    }
}
