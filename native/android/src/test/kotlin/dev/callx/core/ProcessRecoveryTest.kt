package dev.callx.core

import kotlin.io.path.createTempDirectory
import kotlin.test.*

class ProcessRecoveryTest {
    @Test fun recoveryTerminatesLostSessionsAndPreservesTerminalReason() {
        for (state in CallState.entries) {
            val previous = CallRecord("old-call", state, mediaReady = state == CallState.active,
                endReason = if (state == CallState.ended) "callerCancelled" else null, ringDeadlineAtMs = 5_000)
            val core = CallCoordinator(CoordinatorCheckpoint(call = previous, pending = emptyList(), completed = emptyList()))
            val recovered = core.durableRecoverAfterProcessDeath(2_000)
            assertEquals(CallState.ended, recovered?.state)
            assertFalse(recovered!!.mediaReady)
            assertEquals(if (state == CallState.ended) "callerCancelled" else "failed", recovered.endReason)
            val watermark = core.observationCapture().watermark
            assertEquals(recovered, core.durableRecoverAfterProcessDeath(3_000))
            assertEquals(watermark, core.observationCapture().watermark)
        }
    }

    @Test fun expiredCheckpointWithoutPendingCommandsIsRecoveredDurably() {
        val directory = createTempDirectory("callx-recovery-")
        try {
            val store = CoordinatorFileStore(directory.resolve("state.json"))
            CallCoordinator(store).durableReportIncoming("old-call", 1_000, ringDeadlineAtMs = 1_500)
            val restored = CallCoordinator(store)
            assertTrue(restored.pendingCommands().isEmpty())
            assertEquals("unanswered", restored.durableRecoverAfterProcessDeath(2_000)?.endReason)
            val restarted = CallCoordinator(store)
            assertEquals("unanswered", restarted.snapshot()?.endReason)
            assertEquals(IncomingOutcome.Ended("unanswered"), restarted.durableReportIncoming("old-call", 2_100))
            assertEquals(IncomingOutcome.Accepted, restarted.durableReportIncoming("new-call", 2_200))
        } finally { directory.toFile().deleteRecursively() }
    }

    @Test fun recoverySettlesPendingCommandsWithoutReplayingTheirEffects() {
        val core = CallCoordinator()
        core.durableReportIncoming("old-call", 1_000)
        core.durablePrepare(NativeCommand("answer", CommandType.answer, "old-call", deadlineAtMs = 9_000), 1_100)
        val restored = CallCoordinator(core.checkpoint())
        restored.durableRecoverAfterProcessDeath(2_000)
        assertTrue(restored.pendingCommands().isEmpty())
        assertEquals(OperationStatus.rejected, restored.operation("answer")?.status)
        assertEquals("invalidState", restored.operation("answer")?.errorCode)
    }

    @Test fun oldRingTimerCannotExpireANewerCall() {
        val core = CallCoordinator()
        core.durableReportIncoming("new-call", 1_000, ringDeadlineAtMs = 1_500)
        assertNull(core.durableExpireRinging(2_000, "old-call"))
        assertEquals(CallState.incoming, core.snapshot()?.state)
        assertEquals("new-call", core.durableExpireRinging(2_000, "new-call"))
    }
}
