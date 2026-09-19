package dev.callx.core

import java.util.concurrent.CompletableFuture
import java.util.concurrent.CompletionStage

sealed interface PlatformOutcome {
    data class Applied(val completedAtMs: Long) : PlatformOutcome
    data class Rejected(val errorCode: String, val completedAtMs: Long) : PlatformOutcome
    data class TimedOut(val completedAtMs: Long) : PlatformOutcome
    data class Unknown(val errorCode: String, val completedAtMs: Long) : PlatformOutcome
}
fun interface PlatformCommandExecutor { fun perform(command: NativeCommand): CompletionStage<PlatformOutcome> }

class CommandDispatcher(private val coordinator: CallCoordinator, private val executor: PlatformCommandExecutor) {
    private val inFlight = mutableMapOf<String, CompletableFuture<NativeOperation>>()
    @Synchronized fun execute(command: NativeCommand, nowMs: Long): CompletionStage<NativeOperation> {
        when (val prepared = coordinator.durablePrepare(command, nowMs)) {
            is Preparation.Existing -> {
                if (prepared.operation.status == OperationStatus.pending) return inFlight[command.operationId]
                    ?: CompletableFuture.failedFuture(DispatcherViolation("Pending operation requires platform reconciliation"))
                return CompletableFuture.completedFuture(prepared.operation)
            }
            is Preparation.Conflict -> return CompletableFuture.completedFuture(prepared.operation)
            Preparation.Execute -> Unit
        }
        val shared = CompletableFuture<NativeOperation>(); inFlight[command.operationId] = shared
        try {
            executor.perform(command).whenComplete { outcome, failure ->
                try {
                    if (failure != null) shared.completeExceptionally(failure)
                    else shared.complete(when (outcome!!) {
                        is PlatformOutcome.Applied -> coordinator.durableCompleteApplied(command.operationId, outcome.completedAtMs)
                        is PlatformOutcome.Rejected -> coordinator.durableCompleteRejected(command.operationId, outcome.errorCode, outcome.completedAtMs)
                        is PlatformOutcome.TimedOut -> coordinator.durableCompleteTimedOut(command.operationId, outcome.completedAtMs)
                        is PlatformOutcome.Unknown -> coordinator.durableCompleteUnknown(command.operationId, outcome.errorCode, outcome.completedAtMs)
                    } ?: NativeOperation(command.operationId, OperationStatus.unknown, "internal"))
                } catch (error: Throwable) { shared.completeExceptionally(error) }
                finally { synchronized(this) { inFlight.remove(command.operationId) } }
            }
        } catch (error: Throwable) { inFlight.remove(command.operationId); shared.completeExceptionally(error) }
        return shared
    }
}
class DispatcherViolation(message: String) : IllegalStateException(message)
