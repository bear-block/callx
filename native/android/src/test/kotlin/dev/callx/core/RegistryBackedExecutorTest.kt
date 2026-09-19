package dev.callx.core

import java.util.concurrent.CompletableFuture
import kotlin.test.*

class RegistryBackedExecutorTest {
    @Test fun acceptedWaitsForActionWhileRejectedDoesNot() {
        val registry = PlatformActionRegistry()
        val accepted = RegistryBackedPlatformExecutor({ CompletableFuture.completedFuture(PlatformSubmission.Accepted) }, registry)
        val command = NativeCommand("op", CommandType.answer, "call", deadlineAtMs = 5_000)
        val pending = accepted.perform(command).toCompletableFuture(); assertFalse(pending.isDone)
        registry.complete("op", PlatformActionOutcome.Rejected("platformRejected", 2_000))
        assertEquals(PlatformOutcome.Rejected("platformRejected", 2_000), pending.get())

        val rejected = RegistryBackedPlatformExecutor({ CompletableFuture.completedFuture(
            PlatformSubmission.Rejected("transactionRejected", 1_000)) }, PlatformActionRegistry())
        assertEquals(PlatformOutcome.Rejected("transactionRejected", 1_000), rejected.perform(command).toCompletableFuture().get())
    }
    @Test fun timeoutAndResetRemainDistinct() {
        val timeoutRegistry = PlatformActionRegistry()
        val timeout = RegistryBackedPlatformExecutor({ CompletableFuture.completedFuture(PlatformSubmission.Accepted) }, timeoutRegistry)
            .perform(NativeCommand("timeout", CommandType.answer, "call", deadlineAtMs = 5_000)).toCompletableFuture()
        timeoutRegistry.timeout("timeout", 5_000); assertEquals(PlatformOutcome.TimedOut(5_000), timeout.get())
        val resetRegistry = PlatformActionRegistry()
        val reset = RegistryBackedPlatformExecutor({ CompletableFuture.completedFuture(PlatformSubmission.Accepted) }, resetRegistry)
            .perform(NativeCommand("reset", CommandType.answer, "call", deadlineAtMs = 5_000)).toCompletableFuture()
        resetRegistry.providerReset(2_000); assertEquals(PlatformOutcome.Unknown("nativeUnavailable", 2_000), reset.get())
    }
}
