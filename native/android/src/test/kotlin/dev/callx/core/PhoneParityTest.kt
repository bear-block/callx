package dev.callx.core

import java.util.concurrent.CompletableFuture
import kotlin.io.path.createTempDirectory
import kotlin.test.*

/** ADR-0013: audio routes are observed call state; routes, tones and names change by command. */
class PhoneParityTest {
    private val routes = listOf(AudioRoute("ear", AudioRouteKind.earpiece, "Phone"),
        AudioRoute("spk", AudioRouteKind.speaker, "Speaker"), AudioRoute("bt", AudioRouteKind.bluetooth, "Car kit"))
    private fun active(core: CallCoordinator = CallCoordinator()): CallCoordinator {
        core.reportIncoming("call-1", 900, "hao.dev7", "+84901")
        core.prepare(NativeCommand("answer", CommandType.answer, "call-1", deadlineAtMs = 5_000), 1_000)
        core.completeApplied("answer", 1_000); core.mediaConnected("call-1", 1_050)
        return core
    }
    private fun run(core: CallCoordinator, command: NativeCommand, at: Long = 1_100): NativeOperation? =
        when (val prepared = core.prepare(command, at)) {
            is Preparation.Existing -> prepared.operation
            is Preparation.Conflict -> prepared.operation
            Preparation.Execute -> core.completeApplied(command.operationId, at + 10)
        }
    private fun route(id: String, routeId: String?) =
        NativeCommand(id, CommandType.setAudioRoute, "call-1", audioRoute = routeId, deadlineAtMs = 5_000)

    @Test fun aDisconnectedRouteCannotReappearWhenItsCommandCompletes() {
        val core = active()
        core.audioRoutesObserved("call-1", "ear", routes, 1_060)
        assertEquals(Preparation.Execute, core.prepare(route("switch-late", "bt"), 1_100))
        core.audioRoutesObserved("call-1", "ear", routes.take(2), 1_110)
        assertEquals(OperationStatus.applied, core.completeApplied("switch-late", 1_120)?.status)
        assertEquals("ear", core.snapshot()?.audioRoute)
    }

    @Test fun routesAreObservedAndAnUnlistedCurrentRouteIsUnknown() {
        val core = active()
        assertTrue(core.audioRoutesObserved("call-1", "ear", routes, 1_060))
        assertEquals(routes, core.snapshot()!!.audioRoutes); assertEquals("ear", core.snapshot()!!.audioRoute)
        assertFalse(core.audioRoutesObserved("call-1", "ear", routes, 1_061), "unchanged routes are not an event")
        core.audioRoutesObserved("call-1", "gone", routes.take(2), 1_070)
        assertNull(core.snapshot()!!.audioRoute)
        assertFalse(core.audioRoutesObserved("call-2", "ear", routes, 1_080))
    }

    @Test fun setAudioRouteNeedsAListedRouteAndACallWithAudio() {
        val core = CallCoordinator(); core.reportIncoming("call-1", 900, "hao.dev7", "+84901")
        core.audioRoutesObserved("call-1", "ear", routes, 950)
        assertEquals("invalidState", run(core, route("ringing", "spk"))?.errorCode)
        active(CallCoordinator()).let { live ->
            live.audioRoutesObserved("call-1", "ear", routes, 1_060)
            assertEquals("invalidArgument", run(live, route("unknown", "hdmi"))?.errorCode)
            assertEquals("invalidArgument", run(live, route("missing", null))?.errorCode)
            assertEquals(OperationStatus.applied, run(live, route("speaker", "spk"))?.status)
            assertEquals("spk", live.snapshot()!!.audioRoute)
        }
    }

    @Test fun endingClearsRoutes() {
        val core = active(); core.audioRoutesObserved("call-1", "ear", routes, 1_060)
        core.remoteEnded("call-1", nowMs = 1_200)
        assertEquals(emptyList(), core.snapshot()!!.audioRoutes); assertNull(core.snapshot()!!.audioRoute)
        assertFalse(core.audioRoutesObserved("call-1", "ear", routes, 1_300))
    }

    @Test fun dtmfNeedsAnActiveCallAndKeypadDigitsAndChangesNothing() {
        val ringing = CallCoordinator(); ringing.reportIncoming("call-1", 900, "hao.dev7", "+84901")
        assertEquals("invalidState", run(ringing, NativeCommand("early", CommandType.sendDtmf, "call-1", digits = "1",
            deadlineAtMs = 5_000))?.errorCode)
        val core = active()
        assertEquals("invalidArgument", run(core, NativeCommand("letters", CommandType.sendDtmf, "call-1", digits = "12a",
            deadlineAtMs = 5_000))?.errorCode)
        val before = core.snapshot(); val sequence = core.checkpoint().journal!!.nextSequence
        assertEquals(OperationStatus.applied, run(core, NativeCommand("tones", CommandType.sendDtmf, "call-1", digits = "*12#",
            deadlineAtMs = 5_000))?.status)
        assertEquals(before, core.snapshot())
        val events = (core.replayEvents(sequence - 1) as ReplayOutcome.Replay).events
        assertEquals(listOf("operationCompleted"), events.map { it.kind })
    }

    @Test fun setDisplayNameRenamesALiveCall() {
        val core = CallCoordinator(); core.reportIncoming("call-1", 900, "hao.dev7", "+84901")
        assertEquals(OperationStatus.applied, run(core, NativeCommand("rename", CommandType.setDisplayName, "call-1",
            displayName = "Front desk", deadlineAtMs = 5_000))?.status)
        assertEquals("Front desk", core.snapshot()!!.displayName)
        assertEquals("invalidArgument", run(core, NativeCommand("empty", CommandType.setDisplayName, "call-1",
            displayName = "", deadlineAtMs = 5_000))?.errorCode)
    }

    @Test fun routesAndPendingCommandsSurviveACheckpoint() {
        val path = createTempDirectory("callx-parity").resolve("coordinator.json")
        val core = CallCoordinator(CoordinatorFileStore(path))
        core.durableReportIncoming("call-1", 900, "hao.dev7", "+84901")
        core.durableAudioRoutesObserved("call-1", "bt", routes, 950)
        core.durablePrepare(NativeCommand("tones", CommandType.sendDtmf, "call-1", digits = "1", deadlineAtMs = 5_000), 960)
        val restored = CallCoordinator(CoordinatorFileStore(path))
        assertEquals(core.snapshot(), restored.snapshot())
        assertEquals(core.checkpoint().completed, restored.checkpoint().completed)
    }

    @Test fun theBridgeDecodesTheNewCommandsAndCarriesRoutesOnlyWhenKnown() {
        val core = active()
        val bridge = BridgeRuntime(core, PlatformCommandExecutor { CompletableFuture.completedFuture(PlatformOutcome.Applied(1_100)) },
            BridgeCapabilities("generation-1", true, false, true, true, dtmf = true), nowMs = { 1_000 })
        assertEquals(true, bridge.setup(mapOf("contractVersion" to "0.3.0"))["dtmf"])
        fun execute(id: String, type: String, value: Any?) = bridge.execute(mapOf("contractVersion" to "0.3.0",
            "operationId" to id, "type" to type, "callId" to "call-1", "value" to value)).toCompletableFuture().join()
        var call = bridge.getSnapshot()["call"] as Map<*, *>
        assertFalse(call.containsKey("audioRoutes")); assertFalse(call.containsKey("audioRoute"))
        val long = "x".repeat(200)
        bridge.audioRoutesObserved("call-1", "ear", routes + AudioRoute(long, AudioRouteKind.other, ""))
        call = bridge.getSnapshot()["call"] as Map<*, *>
        val listed = call["audioRoutes"] as List<*>
        assertEquals(mapOf("id" to "ear", "kind" to "earpiece", "name" to "Phone"), listed.first())
        assertEquals(mapOf("id" to "x".repeat(128), "kind" to "other", "name" to "other"), listed.last())
        assertEquals("ear", call["audioRoute"])
        assertEquals("applied", execute("spk", "setAudioRoute", "spk")["status"])
        assertEquals("spk", (bridge.getSnapshot()["call"] as Map<*, *>)["audioRoute"])
        assertEquals("applied", execute("tones", "sendDtmf", "123")["status"])
        assertEquals("applied", execute("name", "setDisplayName", "Front desk")["status"])
        assertEquals("Front desk", (bridge.getSnapshot()["call"] as Map<*, *>)["displayName"])
        assertFailsWith<BridgeViolation> { execute("bad-dtmf", "sendDtmf", "abc") }
        assertFailsWith<BridgeViolation> { execute("bad-route", "setAudioRoute", true) }
        assertFailsWith<BridgeViolation> { execute("bad-name", "setDisplayName", "") }
    }
}
