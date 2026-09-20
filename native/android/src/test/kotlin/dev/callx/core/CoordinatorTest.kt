package dev.callx.core

import kotlin.test.*
import kotlin.io.path.createTempDirectory
import kotlinx.serialization.json.put

class CoordinatorTest {
    @Test fun outgoingRequiresMetadataAndCommitsOnlyAfterPlatformApplied() {
        val core = CallCoordinator()
        val invalid = NativeCommand("bad-start", CommandType.startCall, "call-out", deadlineAtMs = 5_000)
        assertEquals(OperationStatus.rejected, (core.prepare(invalid, 1_000) as Preparation.Existing).operation.status)
        val start = NativeCommand("start", CommandType.startCall, "call-out",
            displayName = "hao.dev7", handle = "sip:hao.dev7@example.invalid", deadlineAtMs = 5_000)
        assertEquals(Preparation.Execute, core.prepare(start, 1_001)); assertNull(core.snapshot())
        assertEquals(OperationStatus.applied, core.completeApplied("start", 1_100)?.status)
        assertEquals(1_100, core.operation("start")?.completedAtMs)
        assertEquals(CallRecord("call-out", CallState.outgoing, displayName = "hao.dev7",
            handle = "sip:hao.dev7@example.invalid", direction = CallDirection.outgoing, createdAtMs = 1_100),
            core.snapshot())
        core.remoteAnswered("call-out", 1_200)
        assertEquals(CallState.connecting, core.snapshot()?.state); assertEquals(1_200, core.snapshot()?.acceptedAtMs)
        core.mediaConnected("call-out", 1_300)
        assertEquals(CallState.active, core.snapshot()?.state); assertTrue(core.snapshot()!!.mediaReady)
        assertEquals(1_300, core.snapshot()?.mediaConnectedAtMs)
    }
    @Test fun checkpointRecoversPendingAndCompletedOperations() {
        val directory = createTempDirectory("callx-core-")
        try {
            val store = CoordinatorFileStore(directory.resolve("coordinator.json"))
            val core = CallCoordinator(); core.reportIncoming("call-1", 900, "hao.dev7", "+84901234567")
            val applied = NativeCommand("applied", CommandType.answer, "call-1", deadlineAtMs = 5_000)
            assertEquals(Preparation.Execute, core.prepare(applied, 1_000)); core.completeApplied("applied", 1_100)
            val pending = NativeCommand("pending", CommandType.end, "call-1", deadlineAtMs = 5_000)
            assertEquals(Preparation.Execute, core.prepare(pending, 1_200)); store.save(core.checkpoint())
            val recovered = CallCoordinator(requireNotNull(store.load()))
            assertEquals(CallState.connecting, recovered.snapshot()?.state)
            assertEquals("hao.dev7", recovered.snapshot()?.displayName)
            assertEquals("+84901234567", recovered.snapshot()?.handle)
            assertEquals(CallDirection.incoming, recovered.snapshot()?.direction)
            assertEquals(900, recovered.snapshot()?.createdAtMs)
            assertEquals(1_100, recovered.snapshot()?.acceptedAtMs)
            assertEquals(OperationStatus.applied, recovered.operation("applied")?.status)
            assertEquals(OperationStatus.pending, recovered.operation("pending")?.status)
            recovered.expire(5_000); assertEquals(OperationStatus.timedOut, recovered.operation("pending")?.status)
        } finally { directory.toFile().deleteRecursively() }
    }
    @Test fun unsupportedCheckpointSchemaFailsClosed() {
        assertFailsWith<StoreViolation> {
            CoordinatorCheckpointCodec.decode(
                kotlinx.serialization.json.buildJsonObject { put("schemaVersion", 2) },
            )
        }
    }
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
