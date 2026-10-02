package dev.callx.core

import java.util.concurrent.CompletableFuture
import kotlin.io.path.createTempDirectory
import kotlin.test.*

/** ADR-0010: video is a property of the call, camera control is a command, the rest is observed. */
class VideoCallTest {
    private fun answered(core: CallCoordinator = CallCoordinator()): CallCoordinator {
        core.reportIncoming("call-1", 900, "hao.dev7", "+84901", video = true)
        core.prepare(NativeCommand("answer", CommandType.answer, "call-1", deadlineAtMs = 5_000), 1_000)
        core.completeApplied("answer", 1_000)
        return core
    }
    private fun camera(core: CallCoordinator, id: String, on: Boolean, at: Long): NativeOperation? {
        val prepared = core.prepare(NativeCommand(id, CommandType.setCamera, "call-1", value = on, deadlineAtMs = at + 4_000), at)
        if (prepared is Preparation.Existing) return prepared.operation
        return core.completeApplied(id, at + 10)
    }

    @Test fun videoIsAPropertyOfTheCallNotAState() {
        val core = answered()
        assertTrue(core.snapshot()!!.video); assertEquals(CallState.connecting, core.snapshot()!!.state)
        // Remote video before audio does not make the call active.
        assertTrue(core.videoObserved("call-1", null, remoteVideo = true, nowMs = 1_050))
        assertEquals(CallState.connecting, core.snapshot()!!.state)
        core.mediaConnected("call-1", 1_100)
        assertEquals(CallState.active, core.snapshot()!!.state); assertTrue(core.snapshot()!!.remoteVideo)
    }

    @Test fun cameraOnAndOffAreCommandsCommittedOnlyWhenApplied() {
        val core = answered()
        val on = NativeCommand("cam-on", CommandType.setCamera, "call-1", value = true, deadlineAtMs = 5_000)
        assertEquals(Preparation.Execute, core.prepare(on, 1_100))
        assertEquals(LocalVideo.off, core.snapshot()!!.localVideo)
        core.completeApplied("cam-on", 1_200)
        assertEquals(LocalVideo.on, core.snapshot()!!.localVideo); assertEquals(CameraFacing.front, core.snapshot()!!.cameraFacing)
        assertEquals(OperationStatus.applied, camera(core, "cam-off", false, 1_300)?.status)
        assertEquals(LocalVideo.off, core.snapshot()!!.localVideo)
        // A rejected camera command leaves the camera as it was.
        core.prepare(NativeCommand("cam-denied", CommandType.setCamera, "call-1", value = true, deadlineAtMs = 5_000), 1_400)
        core.completeRejected("cam-denied", "permissionDenied", 1_410)
        assertEquals(LocalVideo.off, core.snapshot()!!.localVideo)
    }

    @Test fun cameraCommandsNeedALiveAnsweredCall() {
        val core = CallCoordinator(); core.reportIncoming("call-1", 900, "hao.dev7", "+84901", video = true)
        assertEquals("invalidState", camera(core, "ringing", true, 1_000)?.errorCode)
        val missing = core.prepare(NativeCommand("no-value", CommandType.setCamera, "call-1", deadlineAtMs = 5_000), 1_000)
        assertEquals("invalidArgument", (missing as Preparation.Existing).operation.errorCode)
        val noFacing = core.prepare(NativeCommand("no-facing", CommandType.switchCamera, "call-1", deadlineAtMs = 5_000), 1_000)
        assertEquals("invalidArgument", (noFacing as Preparation.Existing).operation.errorCode)
        assertEquals("callNotFound", (core.prepare(NativeCommand("other", CommandType.setCamera, "call-2", value = true,
            deadlineAtMs = 5_000), 1_000) as Preparation.Existing).operation.errorCode)
    }

    @Test fun anAudioCallCanTurnTheCameraOn() {
        val core = CallCoordinator(); core.reportIncoming("call-1", 900, "hao.dev7", "+84901")
        core.prepare(NativeCommand("answer", CommandType.answer, "call-1", deadlineAtMs = 5_000), 1_000)
        core.completeApplied("answer", 1_000)
        assertFalse(core.snapshot()!!.video)
        assertEquals(OperationStatus.applied, camera(core, "cam-on", true, 1_100)?.status)
        assertEquals(LocalVideo.on, core.snapshot()!!.localVideo)
    }

    @Test fun switchingTheCameraIsRememberedEvenWhileItIsOff() {
        val core = answered()
        core.prepare(NativeCommand("back", CommandType.switchCamera, "call-1", facing = CameraFacing.back, deadlineAtMs = 5_000), 1_100)
        core.completeApplied("back", 1_110)
        assertEquals(CameraFacing.back, core.snapshot()!!.cameraFacing); assertEquals(LocalVideo.off, core.snapshot()!!.localVideo)
        camera(core, "cam-on", true, 1_200)
        assertEquals(CameraFacing.back, core.snapshot()!!.cameraFacing)
    }

    @Test fun theAdapterCanOnlyReportTheCameraTakenOrGivenBack() {
        val core = answered()
        // The adapter cannot turn the camera on by itself.
        assertFalse(core.videoObserved("call-1", LocalVideo.on, null, 1_050))
        assertFalse(core.videoObserved("call-1", LocalVideo.blocked, null, 1_060))
        camera(core, "cam-on", true, 1_100)
        assertTrue(core.videoObserved("call-1", LocalVideo.blocked, null, 1_200))
        assertEquals(LocalVideo.blocked, core.snapshot()!!.localVideo)
        assertFalse(core.videoObserved("call-1", LocalVideo.blocked, null, 1_250))
        assertTrue(core.videoObserved("call-1", LocalVideo.on, null, 1_300))
        assertEquals(LocalVideo.on, core.snapshot()!!.localVideo)
        // Turning the camera off from blocked is a command, and wins.
        core.videoObserved("call-1", LocalVideo.blocked, null, 1_400)
        camera(core, "cam-off", false, 1_500)
        assertEquals(LocalVideo.off, core.snapshot()!!.localVideo)
        assertFalse(core.videoObserved("call-1", LocalVideo.on, null, 1_600))
    }

    @Test fun endingTheCallResetsVideoButKeepsWhatItWas() {
        val core = answered(); camera(core, "cam-on", true, 1_100)
        core.videoObserved("call-1", null, true, 1_150)
        core.remoteEnded("call-1", nowMs = 1_200)
        val ended = core.snapshot()!!
        assertTrue(ended.video); assertEquals(LocalVideo.off, ended.localVideo); assertFalse(ended.remoteVideo)
        assertFalse(core.videoObserved("call-1", null, true, 1_300))
    }

    @Test fun videoStateSurvivesTheCheckpoint() {
        val path = createTempDirectory("callx-video").resolve("coordinator.json")
        val core = answered(CallCoordinator(CoordinatorFileStore(path)))
        core.durablePrepare(NativeCommand("back", CommandType.switchCamera, "call-1", facing = CameraFacing.back, deadlineAtMs = 5_000), 1_100)
        core.durableCompleteApplied("back", 1_110)
        core.durablePrepare(NativeCommand("cam-on", CommandType.setCamera, "call-1", value = true, deadlineAtMs = 5_000), 1_200)
        core.durableVideoObserved("call-1", null, true, 1_250)
        val restored = CallCoordinator(CoordinatorFileStore(path))
        assertEquals(core.snapshot(), restored.snapshot())
        assertEquals(listOf(NativeCommand("cam-on", CommandType.setCamera, "call-1", value = true, deadlineAtMs = 5_000)),
            restored.pendingCommands())
        restored.durableCompleteApplied("cam-on", 1_300)
        assertEquals(LocalVideo.on, restored.snapshot()!!.localVideo); assertEquals(CameraFacing.back, restored.snapshot()!!.cameraFacing)
    }

    @Test fun theBridgeCarriesVideoFieldsOnlyWhenTheyAreSet() {
        val core = CallCoordinator()
        val bridge = BridgeRuntime(core, PlatformCommandExecutor { CompletableFuture.completedFuture(PlatformOutcome.Applied(1_100)) },
            BridgeCapabilities("generation-1", true, false, true, true, video = true), nowMs = { 1_000 })
        assertEquals(true, bridge.setup(mapOf("contractVersion" to "0.2.0"))["video"])
        assertEquals("0.2.0", bridge.setup(mapOf("contractVersion" to "0.1.0"))["contractVersion"])
        bridge.execute(mapOf("contractVersion" to "0.2.0", "operationId" to "start", "type" to "startCall",
            "input" to mapOf("callId" to "call-1", "displayName" to "hao.dev7", "handle" to "sip:a@example.invalid", "video" to true),
        )).toCompletableFuture().join()
        var call = bridge.getSnapshot()["call"] as Map<*, *>
        assertEquals(true, call["video"]); assertFalse(call.containsKey("localVideo")); assertFalse(call.containsKey("cameraFacing"))
        assertFalse(call.containsKey("remoteVideo"))
        bridge.remoteAnswered("call-1", 1_000)
        val switched = bridge.execute(mapOf("contractVersion" to "0.2.0", "operationId" to "back", "type" to "switchCamera",
            "callId" to "call-1", "value" to "back")).toCompletableFuture().join()
        assertEquals("applied", switched["status"])
        bridge.execute(mapOf("contractVersion" to "0.2.0", "operationId" to "cam", "type" to "setCamera",
            "callId" to "call-1", "value" to true)).toCompletableFuture().join()
        bridge.videoObserved("call-1", remoteVideo = true)
        call = bridge.getSnapshot()["call"] as Map<*, *>
        assertEquals("on", call["localVideo"]); assertEquals("back", call["cameraFacing"]); assertEquals(true, call["remoteVideo"])
        assertFailsWith<BridgeViolation> { bridge.execute(mapOf("contractVersion" to "0.2.0", "operationId" to "bad",
            "type" to "switchCamera", "callId" to "call-1", "value" to "side")) }
        assertFailsWith<BridgeViolation> { bridge.execute(mapOf("contractVersion" to "0.2.0", "operationId" to "bad2",
            "type" to "setCamera", "callId" to "call-1")) }
        // An audio call keeps the 0.1 shape.
        val audio = CallCoordinator(); audio.reportIncoming("call-2", 900, "hao.dev7", "+84901")
        val audioCall = BridgeRuntime(audio, PlatformCommandExecutor { CompletableFuture.completedFuture(PlatformOutcome.Applied(1)) },
            BridgeCapabilities("generation-1", true, false, true, true), nowMs = { 1_000 }).getSnapshot()["call"] as Map<*, *>
        assertTrue(audioCall.keys.none { it in setOf("video", "localVideo", "cameraFacing", "remoteVideo") })
    }

    @Test fun callObserversFollowEveryChangeWithoutAnObservationSession() {
        val core = CallCoordinator()
        val bridge = BridgeRuntime(core, PlatformCommandExecutor { CompletableFuture.completedFuture(PlatformOutcome.Applied(1_100)) },
            BridgeCapabilities("generation-1", true, false, true, true, video = true), nowMs = { 1_000 })
        val seen = mutableListOf<CallState?>()
        val stop = bridge.addCallObserver { seen += it?.state }
        bridge.reportIncoming("call-1", "hao.dev7", "+84901", video = true)
        bridge.execute(mapOf("contractVersion" to "0.2.0", "operationId" to "a", "type" to "answer", "callId" to "call-1"))
            .toCompletableFuture().join()
        bridge.remoteEnded("call-1")
        stop()
        bridge.reportIncoming("call-2", "hao.dev7", "+84901", video = true)
        assertEquals(listOf(null, CallState.incoming, CallState.connecting, CallState.ended), seen)
    }
}
