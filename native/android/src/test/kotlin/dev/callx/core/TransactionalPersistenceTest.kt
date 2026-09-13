package dev.callx.core

import kotlin.test.*

private class FaultStore : CoordinatorStore {
    var saved: CoordinatorCheckpoint? = null
    var failWrites = false
    override fun load() = saved
    override fun save(checkpoint: CoordinatorCheckpoint) {
        if (failWrites) throw Failure(); saved = checkpoint
    }
    class Failure : RuntimeException()
}

class TransactionalPersistenceTest {
    @Test fun mutationPersistsBeforeSuccessAndRollsBackOnWriteFailure() {
        val store = FaultStore(); val core = CallCoordinator(store)
        core.durableReportIncoming("call-1", 1_000); assertEquals(CallState.incoming, store.saved?.call?.state)
        val command = NativeCommand("answer", CommandType.answer, "call-1", deadlineAtMs = 5_000)
        store.failWrites = true
        assertFailsWith<FaultStore.Failure> { core.durablePrepare(command, 1_100) }
        assertNull(core.operation("answer")); assertTrue(store.saved?.pending?.isEmpty() == true)
        val recovered = CallCoordinator(store)
        assertEquals(CallState.incoming, recovered.snapshot()?.state); assertNull(recovered.operation("answer"))
    }
}
