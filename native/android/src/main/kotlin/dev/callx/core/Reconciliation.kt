package dev.callx.core

import java.util.concurrent.CompletableFuture
import java.util.concurrent.CompletionStage

sealed interface ReconciliationOutcome {
    data class Applied(val observedAtMs: Long) : ReconciliationOutcome
    data class Rejected(val errorCode: String, val observedAtMs: Long) : ReconciliationOutcome
    data class Unavailable(val observedAtMs: Long) : ReconciliationOutcome
}
fun interface OperationReconciliationProbe { fun query(command: NativeCommand): CompletionStage<ReconciliationOutcome> }

class RecoveredOperationReconciler(private val coordinator: CallCoordinator,
    private val probe: OperationReconciliationProbe) {
    fun reconcile(nowMs: Long): CompletionStage<List<NativeOperation>> {
        var chain: CompletionStage<MutableList<NativeOperation>> = CompletableFuture.completedFuture(mutableListOf())
        coordinator.pendingCommands().forEach { command -> chain = chain.thenCompose { results ->
            if (command.deadlineAtMs <= nowMs) {
                coordinator.durableExpire(nowMs)
                coordinator.operation(command.operationId)?.let(results::add)
                CompletableFuture.completedFuture(results)
            } else probe.query(command).thenApply { outcome ->
                val result = when (outcome) {
                    is ReconciliationOutcome.Applied -> coordinator.durableCompleteApplied(command.operationId, outcome.observedAtMs)
                    is ReconciliationOutcome.Rejected -> coordinator.durableCompleteRejected(command.operationId, outcome.errorCode, outcome.observedAtMs)
                    is ReconciliationOutcome.Unavailable -> coordinator.durableCompleteUnknown(command.operationId, "nativeUnavailable", outcome.observedAtMs)
                }
                result?.let(results::add); results
            }
        } }
        return chain.thenApply { it.toList() }
    }
}
