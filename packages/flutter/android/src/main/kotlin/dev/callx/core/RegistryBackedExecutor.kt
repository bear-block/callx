package dev.callx.core

import java.util.concurrent.CompletableFuture
import java.util.concurrent.CompletionStage

sealed interface PlatformSubmission {
    data object Accepted : PlatformSubmission
    data class Rejected(val errorCode: String, val completedAtMs: Long) : PlatformSubmission
}
fun interface PlatformTransactionSubmitter { fun submit(command: NativeCommand): CompletionStage<PlatformSubmission> }

class RegistryBackedPlatformExecutor(private val submitter: PlatformTransactionSubmitter,
    private val registry: PlatformActionRegistry) : PlatformCommandExecutor {
    override fun perform(command: NativeCommand): CompletionStage<PlatformOutcome> =
        submitter.submit(command).thenCompose { submission -> when (submission) {
            is PlatformSubmission.Rejected -> CompletableFuture.completedFuture(
                PlatformOutcome.Rejected(submission.errorCode, submission.completedAtMs))
            PlatformSubmission.Accepted -> registry.outcome(command.operationId).thenApply { outcome -> when (outcome) {
                is PlatformActionOutcome.Applied -> PlatformOutcome.Applied(outcome.completedAtMs)
                is PlatformActionOutcome.Rejected -> PlatformOutcome.Rejected(outcome.errorCode, outcome.completedAtMs)
                is PlatformActionOutcome.TimedOut -> PlatformOutcome.TimedOut(outcome.completedAtMs)
                is PlatformActionOutcome.ProviderReset -> PlatformOutcome.Unknown("nativeUnavailable", outcome.completedAtMs)
            } }
        } }
}
