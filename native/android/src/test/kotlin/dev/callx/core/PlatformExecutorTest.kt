package dev.callx.core

import java.util.concurrent.CompletableFuture
import kotlin.test.*

class PlatformExecutorTest {
    @Test fun appliedRejectedDuplicateAndLateCallbacksMapCorrectly() {
        var calls = 0
        val core = CallCoordinator().also { it.reportIncoming("call-1") }
        val dispatcher = CommandDispatcher(core) { calls++; CompletableFuture.completedFuture(PlatformOutcome.Applied(1_100)) }
        val answer = NativeCommand("answer", CommandType.answer, "call-1", deadlineAtMs = 2_000)
        assertEquals(OperationStatus.applied, dispatcher.execute(answer, 1_000).toCompletableFuture().get().status)
        assertEquals(OperationStatus.applied, dispatcher.execute(answer, 1_200).toCompletableFuture().get().status)
        assertEquals(1, calls)

        val rejectedCore = CallCoordinator().also { it.reportIncoming("call-2") }
        val rejected = CommandDispatcher(rejectedCore) { CompletableFuture.completedFuture(PlatformOutcome.Rejected("platformRejected", 1_100)) }
            .execute(NativeCommand("reject", CommandType.answer, "call-2", deadlineAtMs = 2_000), 1_000).toCompletableFuture().get()
        assertEquals(OperationStatus.rejected, rejected.status); assertEquals(CallState.incoming, rejectedCore.snapshot()?.state)

        val lateCore = CallCoordinator().also { it.reportIncoming("call-3") }
        val late = CommandDispatcher(lateCore) { CompletableFuture.completedFuture(PlatformOutcome.Applied(2_100)) }
            .execute(NativeCommand("late", CommandType.answer, "call-3", deadlineAtMs = 2_000), 1_000).toCompletableFuture().get()
        assertEquals(OperationStatus.timedOut, late.status); assertEquals(CallState.incoming, lateCore.snapshot()?.state)
    }

    @Test fun concurrentDuplicateCallersShareOneExecution() {
        val core = CallCoordinator().also { it.reportIncoming("call-4") }
        val platform = CompletableFuture<PlatformOutcome>(); var calls = 0
        val dispatcher = CommandDispatcher(core) { calls++; platform }
        val command = NativeCommand("shared", CommandType.answer, "call-4", deadlineAtMs = 5_000)
        val first = dispatcher.execute(command, 1_000).toCompletableFuture()
        val second = dispatcher.execute(command, 1_001).toCompletableFuture()
        assertSame(first, second); assertEquals(1, calls)
        platform.complete(PlatformOutcome.Applied(1_100))
        assertEquals(first.get(), second.get()); assertEquals(OperationStatus.applied, first.get().status)
    }
}
