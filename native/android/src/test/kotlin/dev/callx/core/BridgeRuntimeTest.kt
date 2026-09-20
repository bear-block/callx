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
        assertEquals(true, bridge.setup(mapOf("contractVersion" to "0.1.0", "appName" to "Acme"))["nativeCalling"])
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
        assertFailsWith<BridgeViolation> { bridge.setup(mapOf("contractVersion" to "0.1.0", "appName" to "")) }
    }

    @Test fun hostIngressAndEveryCommandReachCanonicalMilestones() {
        val bridge = runtime(); bridge.reportIncoming("call-1", "hao.dev7", "+84901234567", 900)
        fun execute(id: String, type: String, vararg fields: Pair<String, Any?>) = bridge.execute(
            mapOf("contractVersion" to "0.1.0", "operationId" to id, "type" to type, *fields),
        ).toCompletableFuture().join()
        assertEquals("applied", execute("answer", "answer", "callId" to "call-1")["status"])
        bridge.mediaConnected("call-1", 1_200)
        assertEquals("applied", execute("mute", "setMuted", "callId" to "call-1", "value" to true)["status"])
        assertEquals("applied", execute("hold", "setHeld", "callId" to "call-1", "value" to true)["status"])
        assertEquals("held", (bridge.getSnapshot()["call"] as Map<*, *>)["state"])
        assertEquals("applied", execute("end", "end", "callId" to "call-1")["status"])
        assertEquals("ended", (bridge.getSnapshot()["call"] as Map<*, *>)["state"])
    }
}
