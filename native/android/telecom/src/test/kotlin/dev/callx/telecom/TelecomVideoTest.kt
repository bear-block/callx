package dev.callx.telecom

import dev.callx.core.BridgeCapabilities
import dev.callx.core.BridgeRuntime
import dev.callx.core.CallCoordinator
import dev.callx.core.CameraFacing
import dev.callx.core.Invitation
import dev.callx.core.LocalVideo
import java.util.Collections
import java.util.concurrent.ConcurrentHashMap
import kotlin.test.*
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.runBlocking

private class VideoHandle : TelecomCallHandle {
    override suspend fun answer() = TelecomActionResult.Applied
    override suspend fun end() = TelecomActionResult.Applied
    override suspend fun setHeld(held: Boolean) = TelecomActionResult.Applied
    override suspend fun disconnect(code: Int) = TelecomActionResult.Applied
}

private class VideoSessions : IncomingTelecomSessions {
    val handles = ConcurrentHashMap<String, VideoHandle>()
    val video = Collections.synchronizedMap(mutableMapOf<String, Boolean>())
    override suspend fun reportIncoming(callId: String, displayName: String, handle: String) =
        reportIncoming(callId, displayName, handle, false)
    override suspend fun reportIncoming(callId: String, displayName: String, handle: String, video: Boolean): TelecomActionResult {
        this.video[callId] = video; handles[callId] = VideoHandle(); return TelecomActionResult.Applied
    }
    override fun resolve(callId: String) = handles[callId]
}

private object SilentPresenter : IncomingCallPresenter {
    override fun showIncoming(invitation: Invitation) {}
    override fun showOutgoing(callId: String, displayName: String) {}
    override fun showOngoing(callId: String, answeredAtMs: Long?) {}
    override fun dismiss(callId: String) {}
}

private class FakeVideoAdapter : CallxVideoAdapter {
    val camera = Collections.synchronizedList(mutableListOf<String>())
    val sinks = ConcurrentHashMap<String, CallxMediaSink>()
    var error: CallxCameraError? = null
    override fun start(callId: String, sink: CallxMediaSink) { sinks[callId] = sink }
    override fun stop(callId: String) {}
    override suspend fun setMuted(callId: String, muted: Boolean) = true
    override suspend fun setCamera(callId: String, on: Boolean, facing: CameraFacing): CallxCameraError? {
        camera += "$on:$facing"; return error
    }
    override fun attach(callId: String, source: VideoSource, surface: CallxVideoSurface) {}
    override fun detach(callId: String, surface: CallxVideoSurface) {}
}

private class VideoHarness(media: MediaMuteController, var foreground: Boolean = true) {
    val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    val sessions = VideoSessions()
    val ingress = TelecomIngress(scope, SilentPresenter, media = media, isForeground = { foreground })
    val runtime = BridgeRuntime(CallCoordinator(),
        ingress.executor(TelecomPlatformExecutor(scope, sessions, media)),
        BridgeCapabilities("generation-1", true, false, true, true, video = ingress.supportsVideo))
    init { ingress.attach(runtime, sessions) }
    fun call() = runtime.getSnapshot()["call"] as Map<*, *>
    fun command(type: String, value: Any? = null) = runtime.execute(mapOf("contractVersion" to "0.2.0",
        "operationId" to "$type-${System.nanoTime()}", "type" to type, "callId" to "call-1") +
        (value?.let { mapOf("value" to it) } ?: emptyMap())).toCompletableFuture().join()
    fun errorCode(result: Map<String, Any?>) = (result["error"] as Map<*, *>?)?.get("code")
    fun answeredVideoCall() = runBlocking {
        ingress.handleInvitation(Invitation("call-1", "hao.dev7", "+84901", video = true))
        assertEquals("applied", command("answer")["status"])
    }
}

class TelecomVideoTest {
    @Test fun aVideoInvitationIsRecordedAndRegisteredAsVideo() {
        val h = VideoHarness(FakeVideoAdapter())
        try {
            runBlocking { h.ingress.handleInvitation(Invitation("call-1", "hao.dev7", "+84901", video = true)) }
            assertEquals(true, h.sessions.video["call-1"]); assertEquals(true, h.call()["video"])
            assertTrue(h.ingress.supportsVideo)
        } finally { h.scope.cancel() }
    }

    @Test fun cameraCommandsReachTheVideoAdapterWithTheChosenCamera() {
        val adapter = FakeVideoAdapter(); val h = VideoHarness(adapter)
        try {
            h.answeredVideoCall()
            // Switching while off only records the choice.
            assertEquals("applied", h.command("switchCamera", "back")["status"]); assertEquals(emptyList(), adapter.camera)
            assertEquals("applied", h.command("setCamera", true)["status"])
            assertEquals(listOf("true:back"), adapter.camera)
            assertEquals("on", h.call()["localVideo"]); assertEquals("back", h.call()["cameraFacing"])
            assertEquals("applied", h.command("switchCamera", "front")["status"])
            assertEquals("true:front", adapter.camera.last())
            assertEquals("applied", h.command("setCamera", false)["status"])
            assertEquals("false:front", adapter.camera.last()); assertNull(h.call()["localVideo"])
        } finally { h.scope.cancel() }
    }

    @Test fun theCameraNeedsTheForegroundAndThePermission() {
        val adapter = FakeVideoAdapter(); val h = VideoHarness(adapter, foreground = false)
        try {
            h.answeredVideoCall()
            assertEquals("mediaNotReady", h.errorCode(h.command("setCamera", true))); assertEquals(emptyList(), adapter.camera)
            h.foreground = true; adapter.error = CallxCameraError.permissionDenied
            assertEquals("permissionDenied", h.errorCode(h.command("setCamera", true)))
            assertNull(h.call()["localVideo"])
        } finally { h.scope.cancel() }
    }

    @Test fun anAudioAdapterRejectsCameraCommandsAsUnsupported() {
        val h = VideoHarness(MediaMuteController { _, _ -> true })
        try {
            h.answeredVideoCall()
            assertFalse(h.ingress.supportsVideo)
            assertEquals("unsupported", h.errorCode(h.command("setCamera", true)))
        } finally { h.scope.cancel() }
    }

    @Test fun theSinkReportsRemoteVideoAndABlockedCamera() {
        val adapter = FakeVideoAdapter(); val h = VideoHarness(adapter)
        try {
            h.answeredVideoCall(); h.command("setCamera", true)
            val sink = adapter.sinks.getValue("call-1")
            sink.videoChanged(remoteVideo = true); sink.videoChanged(localVideo = LocalVideo.blocked)
            assertEquals(true, h.call()["remoteVideo"]); assertEquals("blocked", h.call()["localVideo"])
        } finally { h.scope.cancel() }
    }

    @Test fun onlyVersionTwoAdaptersThatCarryVideoAreAccepted() {
        assertTrue(callxSupportsMediaAdapter(FakeVideoAdapter()))
        val pretender = object : CallxMediaAdapter {
            override val apiVersion = CALLX_VIDEO_API_VERSION
            override fun start(callId: String, sink: CallxMediaSink) {}
            override fun stop(callId: String) {}
            override suspend fun setMuted(callId: String, muted: Boolean) = true
        }
        assertFalse(callxSupportsMediaAdapter(pretender))
    }
}
