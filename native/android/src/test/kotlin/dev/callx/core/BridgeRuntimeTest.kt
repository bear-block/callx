package dev.callx.core

import java.util.concurrent.CompletableFuture
import kotlin.test.*

class BridgeRuntimeTest {
    private fun runtime(core: CallCoordinator = CallCoordinator()) = BridgeRuntime(core,
        PlatformCommandExecutor { CompletableFuture.completedFuture(PlatformOutcome.Applied(1_100)) },
        BridgeCapabilities("generation-1", durableReplay = true, providerManagedSignaling = false,
            hold = true, mute = true), nowMs = { 1_000 })

    @Test fun roundTripsCommandSnapshotLookupAndObservation() {
        val bridge = runtime()
        assertEquals(true, bridge.setup()["nativeCalling"])
        val opened = bridge.openSession(mapOf("contractVersion" to "0.1.0"))
        val events = mutableListOf<Map<String, Any?>>()
        bridge.setEventListener(events::add)
        val result = bridge.execute(mapOf(
            "contractVersion" to "0.1.0", "operationId" to "op-1", "type" to "startCall",
            "input" to mapOf("callId" to "call-1", "displayName" to "hao.dev7", "handle" to "sip:hao.dev7@example.invalid"),
        )).toCompletableFuture().join()
        assertEquals("applied", result["status"]); assertEquals(1_100L, result["completedAtMs"])
        val call = bridge.getSnapshot()["call"] as Map<*, *>
        assertEquals("hao.dev7", call["displayName"]); assertEquals("outgoing", call["direction"])
        val lookup = bridge.queryOperation(mapOf("contractVersion" to "0.1.0",
            "operationId" to "op-1", "accountGeneration" to "generation-1"))
        assertEquals("available", lookup["status"]); assertEquals(2, events.size)
        assertTrue(events.all { it["sessionId"] == opened["sessionId"] })
    }

    @Test fun replayGapGenerationAndValidationFailClosed() {
        val bridge = runtime()
        assertEquals("resynced", bridge.openSession(mapOf(
            "contractVersion" to "0.1.0", "afterSequence" to "999"))["status"])
        assertEquals("generationMismatch", bridge.queryOperation(mapOf("contractVersion" to "0.1.0",
            "operationId" to "op-1", "accountGeneration" to "generation-old"))["status"])
        assertFailsWith<BridgeViolation> { bridge.execute(mapOf("contractVersion" to "9.0.0")) }
    }
}
