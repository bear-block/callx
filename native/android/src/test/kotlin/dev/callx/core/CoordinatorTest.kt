package dev.callx.core

import kotlin.test.*

class CoordinatorTest {
    @Test fun stateCommitsOnlyAfterApplied() {
        val core = CallCoordinator(); core.reportIncoming("call-1")
        val command = NativeCommand("answer-1", CommandType.answer, "call-1", deadlineAtMs = 5_000)
        assertEquals(Preparation.Execute, core.prepare(command, 1_000)); assertEquals(CallState.incoming, core.snapshot()?.state)
        assertEquals(OperationStatus.applied, core.completeApplied("answer-1", 2_000)?.status)
        assertEquals(CallState.connecting, core.snapshot()?.state); assertFalse(core.snapshot()!!.mediaReady)
    }
    @Test fun duplicateConflictTimeoutAndRemoteEndAreDeterministic() {
        val core = CallCoordinator(); core.reportIncoming("call-1")
        val command = NativeCommand("same", CommandType.answer, "call-1", deadlineAtMs = 2_000)
        assertEquals(Preparation.Execute, core.prepare(command, 1_000))
        assertIs<Preparation.Existing>(core.prepare(command, 1_001))
        assertIs<Preparation.Conflict>(core.prepare(command.copy(type = CommandType.end), 1_002))
        core.expire(2_000); assertEquals(OperationStatus.timedOut, core.completeApplied("same", 2_100)?.status)
        assertEquals(CallState.incoming, core.snapshot()?.state)
        val late = NativeCommand("late", CommandType.answer, "call-1", deadlineAtMs = 5_000)
        assertEquals(Preparation.Execute, core.prepare(late, 2_200)); core.remoteEnded("call-1")
        assertEquals(OperationStatus.rejected, core.completeApplied("late", 2_300)?.status)
        assertEquals(CallState.ended, core.snapshot()?.state)
    }
}
