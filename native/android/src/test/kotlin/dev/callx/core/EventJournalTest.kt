package dev.callx.core

import kotlin.test.*

class EventJournalTest {
    @Test fun replayAcknowledgePruneAndRecovery() {
        val journal = EventJournal()
        journal.append("callChanged", 1_000, callId = "call-1")
        journal.append("operationCompleted", 2_000, operationId = "op-1")
        assertEquals(ReplayOutcome.Replay(journal.state.events), journal.replay(0))
        journal.acknowledge(2); assertEquals(2, journal.state.acknowledged)
        journal.prune(1_000 + EventJournal.RETENTION_MS); assertEquals(ReplayOutcome.Gap, journal.replay(0))

        val core = CallCoordinator(); core.reportIncoming("call-2", 3_000)
        val answer = NativeCommand("answer", CommandType.answer, "call-2", deadlineAtMs = 8_000)
        assertEquals(Preparation.Execute, core.prepare(answer, 3_100)); core.completeApplied("answer", 3_200)
        val recovered = CallCoordinator(core.checkpoint())
        val replay = assertIs<ReplayOutcome.Replay>(recovered.replayEvents(0))
        assertEquals(listOf("callChanged", "callChanged", "operationCompleted"), replay.events.map { it.kind })
    }
}
