package dev.callx.core

import kotlin.test.*

class PlatformExecutorTest {
    @Test fun appliedRejectedDuplicateAndLateCallbacksMapCorrectly() {
        var calls = 0
        val appliedCore = CallCoordinator().also { it.reportIncoming("call-1") }
        val dispatcher = CommandDispatcher(appliedCore) { calls++; PlatformOutcome.Applied(1_100) }
        val answer = NativeCommand("answer", CommandType.answer, "call-1", deadlineAtMs = 2_000)
        assertEquals(OperationStatus.applied, dispatcher.execute(answer, 1_000).status)
        assertEquals(OperationStatus.applied, dispatcher.execute(answer, 1_200).status); assertEquals(1, calls)

        val rejectedCore = CallCoordinator().also { it.reportIncoming("call-2") }
        val rejected = CommandDispatcher(rejectedCore) { PlatformOutcome.Rejected("platformRejected", 1_100) }
            .execute(NativeCommand("reject", CommandType.answer, "call-2", deadlineAtMs = 2_000), 1_000)
        assertEquals(OperationStatus.rejected, rejected.status); assertEquals(CallState.incoming, rejectedCore.snapshot()?.state)

        val lateCore = CallCoordinator().also { it.reportIncoming("call-3") }
        val late = CommandDispatcher(lateCore) { PlatformOutcome.Applied(2_100) }
            .execute(NativeCommand("late", CommandType.answer, "call-3", deadlineAtMs = 2_000), 1_000)
        assertEquals(OperationStatus.timedOut, late.status); assertEquals(CallState.incoming, lateCore.snapshot()?.state)
    }
}
