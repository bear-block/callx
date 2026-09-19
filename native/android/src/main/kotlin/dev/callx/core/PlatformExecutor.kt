package dev.callx.core

sealed interface PlatformOutcome {
    data class Applied(val completedAtMs: Long) : PlatformOutcome
    data class Rejected(val errorCode: String, val completedAtMs: Long) : PlatformOutcome
}
fun interface PlatformCommandExecutor { fun perform(command: NativeCommand): PlatformOutcome }

class CommandDispatcher(private val coordinator: CallCoordinator, private val executor: PlatformCommandExecutor) {
    @Synchronized fun execute(command: NativeCommand, nowMs: Long): NativeOperation {
        when (val prepared = coordinator.durablePrepare(command, nowMs)) {
            is Preparation.Existing -> return prepared.operation
            is Preparation.Conflict -> return prepared.operation
            Preparation.Execute -> Unit
        }
        return when (val outcome = executor.perform(command)) {
            is PlatformOutcome.Applied -> coordinator.durableCompleteApplied(command.operationId, outcome.completedAtMs)
            is PlatformOutcome.Rejected -> coordinator.durableCompleteRejected(command.operationId, outcome.errorCode, outcome.completedAtMs)
        } ?: NativeOperation(command.operationId, OperationStatus.unknown, "internal")
    }
}
