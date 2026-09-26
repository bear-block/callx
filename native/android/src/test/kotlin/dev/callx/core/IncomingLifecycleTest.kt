package dev.callx.core

import kotlin.io.path.createTempDirectory
import kotlin.test.*

class IncomingLifecycleTest {
    @Test fun endedCallIsNeverResurrected() {
        val core = CallCoordinator()
        assertEquals(IncomingOutcome.Accepted, core.reportIncoming("call-1", 1_000, "hao.dev7", "+84901"))
        assertTrue(core.platformEnded("call-1", nowMs = 1_100))
        assertEquals("declined", core.snapshot()?.endReason)
        assertEquals(IncomingOutcome.Ended("declined"), core.reportIncoming("call-1", 1_200, "hao.dev7", "+84901"))
        assertEquals(CallState.ended, core.snapshot()?.state)
    }

    @Test fun cancelBeforeInvitationBlocksTheLateInvitation() {
        val core = CallCoordinator()
        assertFalse(core.remoteEnded("call-2", "callerCancelled", 1_000))
        assertNull(core.snapshot())
        assertEquals(IncomingOutcome.Ended("callerCancelled"), core.reportIncoming("call-2", 1_100, "hao.dev7", "+84901"))
        assertNull(core.snapshot())
    }

    @Test fun remoteEndForAnotherIdLeavesTheLiveCallAlone() {
        val core = CallCoordinator()
        core.reportIncoming("call-1", 1_000, "hao.dev7", "+84901")
        assertFalse(core.remoteEnded("call-2", "callerCancelled", 1_100))
        assertEquals(CallState.incoming, core.snapshot()?.state)
        assertEquals("callerCancelled", core.terminalRecord("call-2", 1_100)?.reason)
    }

    @Test fun duplicateBusyAndExpiredInvitationsDoNotRing() {
        val core = CallCoordinator()
        assertEquals(IncomingOutcome.Accepted, core.reportIncoming("call-1", 1_000, "hao.dev7", "+84901"))
        assertEquals(IncomingOutcome.Duplicate, core.reportIncoming("call-1", 1_050, "hao.dev7", "+84901"))
        assertEquals(IncomingOutcome.Busy, core.reportIncoming("call-3", 1_100, "An", "+84902"))
        core.remoteEnded("call-1", "remoteEnded", 1_200)
        assertEquals(IncomingOutcome.Expired,
            core.reportIncoming("call-4", 1_300, "Binh", "+84903", expiresAtMs = 1_300))
        assertEquals(CallState.ended, core.snapshot()?.state)
    }

    @Test fun ringDeadlineEndsTheCallAsUnanswered() {
        val core = CallCoordinator()
        core.reportIncoming("call-1", 1_000, "hao.dev7", "+84901", ringDeadlineAtMs = 2_000, expiresAtMs = 1_500)
        assertEquals(1_500, core.snapshot()?.ringDeadlineAtMs)
        assertNull(core.expireRinging(1_499))
        assertEquals("call-1", core.expireRinging(1_500))
        assertEquals("unanswered", core.snapshot()?.endReason)
        assertEquals(IncomingOutcome.Ended("unanswered"), core.reportIncoming("call-1", 1_600, "hao.dev7", "+84901"))
    }

    @Test fun answerAfterTheRingDeadlineIsRejected() {
        val core = CallCoordinator()
        core.reportIncoming("call-1", 1_000, "hao.dev7", "+84901", ringDeadlineAtMs = 1_500)
        val answer = NativeCommand("answer", CommandType.answer, "call-1", deadlineAtMs = 5_000)
        val result = core.prepare(answer, 1_600) as Preparation.Existing
        assertEquals("invalidState", result.operation.errorCode)
        assertEquals("unanswered", core.snapshot()?.endReason)
    }

    @Test fun platformAnswerClearsTheRingDeadline() {
        val core = CallCoordinator()
        core.reportIncoming("call-1", 1_000, "hao.dev7", "+84901", ringDeadlineAtMs = 1_500)
        assertTrue(core.platformAnswered("call-1", 1_100))
        assertFalse(core.platformAnswered("call-1", 1_150))
        assertEquals(CallState.connecting, core.snapshot()?.state)
        assertNull(core.expireRinging(9_000))
        assertTrue(core.platformEnded("call-1", nowMs = 1_200))
        assertEquals("localHangup", core.snapshot()?.endReason)
    }

    @Test fun startCallCannotReuseAnEndedId() {
        val core = CallCoordinator()
        core.remoteEnded("call-9", "remoteEnded", 1_000)
        val start = NativeCommand("start", CommandType.startCall, "call-9",
            displayName = "hao.dev7", handle = "sip:hao.dev7@example.invalid", deadlineAtMs = 5_000)
        assertEquals("invalidState", (core.prepare(start, 1_100) as Preparation.Existing).operation.errorCode)
    }

    @Test fun localEndRecordsATombstone() {
        val core = CallCoordinator()
        core.reportIncoming("call-1", 1_000, "hao.dev7", "+84901")
        val end = NativeCommand("end", CommandType.end, "call-1", deadlineAtMs = 5_000)
        assertEquals(Preparation.Execute, core.prepare(end, 1_100)); core.completeApplied("end", 1_200)
        assertEquals("declined", core.terminalRecord("call-1", 1_300)?.reason)
    }

    @Test fun tombstonesSurviveACheckpointAndExpireAfterRetention() {
        val directory = createTempDirectory("callx-terminal-")
        try {
            val store = CoordinatorFileStore(directory.resolve("coordinator.json"))
            val core = CallCoordinator(store)
            core.durableRemoteEnded("call-2", "callerCancelled", 1_000)
            core.durableReportIncoming("call-3", 1_100, "An", "+84902", ringDeadlineAtMs = 9_000)
            val recovered = CallCoordinator(store)
            assertEquals(IncomingOutcome.Ended("callerCancelled"), recovered.reportIncoming("call-2", 1_200, "hao.dev7", "+84901"))
            assertEquals(9_000, recovered.snapshot()?.ringDeadlineAtMs)
            assertNull(recovered.terminalRecord("call-2", 1_000 + CallCoordinator.TERMINAL_RETENTION_MS))
        } finally { directory.toFile().deleteRecursively() }
    }

    @Test fun terminalLedgerKeepsTheNewestRecordsWithinQuota() {
        val core = CallCoordinator()
        repeat(CallCoordinator.TERMINAL_QUOTA + 1) { core.remoteEnded("call-$it", "remoteEnded", 1_000L + it) }
        assertNull(core.terminalRecord("call-0", 5_000))
        assertNotNull(core.terminalRecord("call-${CallCoordinator.TERMINAL_QUOTA}", 5_000))
    }

    @Test fun olderCheckpointsWithoutTombstonesStillLoad() {
        val legacy = kotlinx.serialization.json.Json.parseToJsonElement(
            """{"schemaVersion":1,"pending":[],"completed":[]}""").let {
            CoordinatorCheckpointCodec.decode(it as kotlinx.serialization.json.JsonObject)
        }
        assertTrue(legacy.terminal.isEmpty())
    }

    @Test fun systemMuteAndHoldAreRecordedOnlyWhenTheyApply() {
        val core = CallCoordinator()
        core.reportIncoming("call-1", 1_000, "hao.dev7", "+84901")
        assertFalse(core.platformMuted("call-1", true, 1_050))
        assertFalse(core.platformHeld("call-1", true, 1_060))
        core.platformAnswered("call-1", 1_100)
        assertTrue(core.platformMuted("call-1", true, 1_200))
        assertFalse(core.platformMuted("call-1", true, 1_210))
        assertFalse(core.platformHeld("call-1", true, 1_220))
        core.mediaConnected("call-1", 1_300)
        assertTrue(core.platformHeld("call-1", true, 1_400))
        assertEquals(CallState.held, core.snapshot()?.state)
        assertTrue(core.platformHeld("call-1", false, 1_500))
        assertEquals(CallState.active, core.snapshot()?.state)
        assertTrue(core.snapshot()!!.muted)
        assertFalse(core.platformMuted("call-2", false, 1_600))
    }
}
