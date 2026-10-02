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
        assertEquals(true, bridge.setup(mapOf("contractVersion" to "0.1.0"))["nativeCalling"])
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

    @Test fun nativeIngressReportsOutcomesAndPublishesEvents() {
        val bridge = runtime()
        bridge.openSession(mapOf("contractVersion" to "0.1.0"))
        val events = mutableListOf<Map<String, Any?>>(); bridge.setEventListener(events::add)
        assertEquals(IncomingOutcome.Accepted, bridge.reportIncoming("call-1", "hao.dev7", "+84901", ringDeadlineAtMs = 1_500))
        assertEquals(IncomingOutcome.Duplicate, bridge.reportIncoming("call-1", "hao.dev7", "+84901"))
        assertTrue(bridge.platformAnswered("call-1"))
        val ended = bridge.executeNative(CommandType.end, "call-1").toCompletableFuture().join()
        assertEquals(OperationStatus.applied, ended.status)
        assertEquals("localHangup", (bridge.getSnapshot()["call"] as Map<*, *>)["endReason"])
        assertEquals(IncomingOutcome.Ended("localHangup"), bridge.reportIncoming("call-1", "hao.dev7", "+84901"))
        assertEquals(listOf("platform", "platform", "local", "local"), events.map { it["source"] }.take(4))
        assertFailsWith<BridgeViolation> { bridge.executeNative(CommandType.startCall, "call-2") }
        assertFailsWith<BridgeViolation> { bridge.platformEnded("call-1", "notAReason") }
    }

    @Test fun ringingExpiresThroughTheRuntime() {
        val bridge = runtime()
        bridge.reportIncoming("call-1", "hao.dev7", "+84901", observedAtMs = 1_000, ringDeadlineAtMs = 1_500)
        assertNull(bridge.expireRinging(1_400))
        assertEquals("call-1", bridge.expireRinging(1_500))
        assertFalse(bridge.remoteEnded("call-1", "callerCancelled", 1_600))
    }

    @Test fun deadlineMoreThanThirtySecondsAheadIsRejected() {
        val bridge = runtime()
        fun end(id: String, deadline: Long) = bridge.execute(mapOf("contractVersion" to "0.1.0",
            "operationId" to id, "type" to "end", "callId" to "call-1", "deadlineAtMs" to deadline))
        assertEquals("invalidArgument", assertFailsWith<BridgeViolation> { end("op-far", 31_001) }.code)
        assertNotNull(end("op-limit", 31_000).toCompletableFuture().join()["status"])
        // An expired deadline is not a validation error; the coordinator reports timedOut.
        assertEquals("timedOut", end("op-late", 999).toCompletableFuture().join()["status"])
    }

    @Test fun replayGapGenerationAndValidationFailClosed() {
        val bridge = runtime()
        assertEquals("resynced", bridge.openSession(mapOf(
            "contractVersion" to "0.1.0", "afterSequence" to "999"))["status"])
        assertEquals("generationMismatch", bridge.queryOperation(mapOf("contractVersion" to "0.1.0",
            "operationId" to "op-1", "accountGeneration" to "generation-old"))["status"])
        assertFailsWith<BridgeViolation> { bridge.execute(mapOf("contractVersion" to "9.0.0")) }
        // appName is no longer read: older wrappers that still send it keep working.
        assertEquals(true, bridge.setup(mapOf("contractVersion" to "0.1.0", "appName" to ""))["nativeCalling"])
        assertFailsWith<BridgeViolation> { bridge.setup(mapOf("contractVersion" to "9.0.0")) }
    }

    @Test fun hostIngressAndEveryCommandReachCanonicalMilestones() {
        val bridge = runtime(); bridge.reportIncoming("call-1", "hao.dev7", "+84901234567", 900)
        fun execute(id: String, type: String, vararg fields: Pair<String, Any?>) = bridge.execute(
            mapOf("contractVersion" to "0.1.0", "operationId" to id, "type" to type, *fields),
        ).toCompletableFuture().join()
        assertEquals("applied", execute("answer", "answer", "callId" to "call-1")["status"])
        bridge.mediaConnected("call-1", 1_200)
        assertEquals(false, (bridge.getSnapshot()["call"] as Map<*, *>)["mediaInterrupted"])
        assertTrue(bridge.mediaInterrupted("call-1", 1_250))
        assertEquals(true, (bridge.getSnapshot()["call"] as Map<*, *>)["mediaInterrupted"])
        bridge.mediaConnected("call-1", 1_280)
        assertEquals(false, (bridge.getSnapshot()["call"] as Map<*, *>)["mediaInterrupted"])
        assertEquals("applied", execute("mute", "setMuted", "callId" to "call-1", "value" to true)["status"])
        assertEquals("applied", execute("hold", "setHeld", "callId" to "call-1", "value" to true)["status"])
        assertEquals("held", (bridge.getSnapshot()["call"] as Map<*, *>)["state"])
        assertEquals("applied", execute("end", "end", "callId" to "call-1")["status"])
        assertEquals("ended", (bridge.getSnapshot()["call"] as Map<*, *>)["state"])
    }
    @Test fun endedCallDisappearsFromPublicSnapshotAfterFiveMinutes() {
        val core = CallCoordinator(); var clock = 1_000L
        val bridge = BridgeRuntime(core,
            PlatformCommandExecutor { CompletableFuture.completedFuture(PlatformOutcome.Applied(clock)) },
            BridgeCapabilities("generation-1", true, false, true, true), nowMs = { clock })
        bridge.reportIncoming("call-1", "hao.dev7", "+84901234567", 900)
        bridge.execute(mapOf("contractVersion" to "0.1.0", "operationId" to "end", "type" to "end",
            "callId" to "call-1")).toCompletableFuture().join()
        assertNotNull(bridge.getSnapshot()["call"])
        clock += 300_000
        assertNull(bridge.getSnapshot()["call"])
    }
}
