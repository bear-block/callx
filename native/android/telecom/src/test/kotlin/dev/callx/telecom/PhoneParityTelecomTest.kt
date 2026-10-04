package dev.callx.telecom

import dev.callx.core.BridgeCapabilities
import dev.callx.core.BridgeRuntime
import dev.callx.core.CallCoordinator
import dev.callx.core.Invitation
import java.util.Collections
import java.util.concurrent.ConcurrentHashMap
import kotlin.test.*
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.runBlocking

private class ParityHandle : TelecomCallHandle {
    override suspend fun answer() = TelecomActionResult.Applied
    override suspend fun end() = TelecomActionResult.Applied
    override suspend fun setHeld(held: Boolean) = TelecomActionResult.Applied
    override suspend fun disconnect(code: Int) = TelecomActionResult.Applied
}

private class ParitySessions : IncomingTelecomSessions {
    val handles = ConcurrentHashMap<String, ParityHandle>()
    override suspend fun reportIncoming(callId: String, displayName: String, handle: String): TelecomActionResult {
        handles[callId] = ParityHandle(); return TelecomActionResult.Applied
    }
    override fun resolve(callId: String) = handles[callId]
}

private class RecordingPresenter : IncomingCallPresenter {
    val renamed = Collections.synchronizedList(mutableListOf<String>())
    val missed = Collections.synchronizedList(mutableListOf<MissedCall>())
    override fun showIncoming(invitation: Invitation) {}
    override fun showOutgoing(callId: String, displayName: String) {}
    override fun showOngoing(callId: String, answeredAtMs: Long?) {}
    override fun dismiss(callId: String) {}
    override fun rename(callId: String, displayName: String) { renamed += "$callId:$displayName" }
    override fun showMissed(call: MissedCall) { missed += call }
}

private class DtmfAdapter(var sent: Boolean = true) : CallxMediaAdapter, CallxDtmfAdapter {
    val tones = Collections.synchronizedList(mutableListOf<String>())
    override fun start(callId: String, sink: CallxMediaSink) {}
    override fun stop(callId: String) {}
    override suspend fun setMuted(callId: String, muted: Boolean) = true
    override suspend fun sendDtmf(callId: String, digits: String): Boolean { tones += digits; return sent }
}

private class ParityHarness(media: MediaMuteController, ringTimeoutMs: Long = 45_000) {
    val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    val sessions = ParitySessions()
    val presenter = RecordingPresenter()
    val ingress = TelecomIngress(scope, presenter, media = media, ringTimeoutMs = ringTimeoutMs)
    val runtime = BridgeRuntime(CallCoordinator(), ingress.executor(TelecomPlatformExecutor(scope, sessions, media)),
        BridgeCapabilities("generation-1", true, false, true, true, dtmf = ingress.supportsDtmf))
    init { ingress.attach(runtime, sessions) }
    fun call() = runtime.getSnapshot()["call"] as Map<*, *>
    fun command(type: String, value: Any? = null) = runtime.execute(mapOf("contractVersion" to "0.3.0",
        "operationId" to "$type-${System.nanoTime()}", "type" to type, "callId" to "call-1") +
        (value?.let { mapOf("value" to it) } ?: emptyMap())).toCompletableFuture().join()
    fun errorCode(result: Map<String, Any?>) = (result["error"] as Map<*, *>?)?.get("code")
    fun ring(video: Boolean = false) = runBlocking { ingress.handleInvitation(Invitation("call-1", "hao.dev7", "+84901", video = video)) }
}

class PhoneParityTelecomTest {
    @Test fun dtmfGoesToTheAdapterOnlyWhenItSupportsTones() {
        val adapter = DtmfAdapter(); val h = ParityHarness(adapter)
        try {
            h.ring(); h.command("answer")
            assertEquals("invalidState", h.errorCode(h.command("sendDtmf", "1")), "tones need active media")
            h.runtime.mediaConnected("call-1")
            assertTrue(h.ingress.supportsDtmf)
            assertEquals("applied", h.command("sendDtmf", "12#")["status"]); assertEquals(listOf("12#"), adapter.tones)
            adapter.sent = false
            assertEquals("mediaNotReady", h.errorCode(h.command("sendDtmf", "3")))
        } finally { h.scope.cancel() }
        val audio = ParityHarness(MediaMuteController { _, _ -> true })
        try {
            audio.ring(); audio.command("answer")
            audio.runtime.mediaConnected("call-1")
            assertFalse(audio.ingress.supportsDtmf)
            assertEquals("unsupported", audio.errorCode(audio.command("sendDtmf", "1")))
        } finally { audio.scope.cancel() }
    }

    @Test fun renamingUpdatesThePresenterAndTheSnapshot() {
        val h = ParityHarness(DtmfAdapter())
        try {
            h.ring()
            assertEquals("applied", h.command("setDisplayName", "Front desk")["status"])
            assertEquals(listOf("call-1:Front desk"), h.presenter.renamed); assertEquals("Front desk", h.call()["displayName"])
        } finally { h.scope.cancel() }
    }

    @Test fun aCallThatStopsRingingUnansweredIsMissedOnce() {
        val h = ParityHarness(DtmfAdapter())
        try {
            h.ring(video = true)
            runBlocking { h.ingress.remoteEnded("call-1", "callerCancelled") }
            runBlocking { h.ingress.remoteEnded("call-1", "callerCancelled") }
            assertEquals(1, h.presenter.missed.size)
            val missed = h.presenter.missed.single()
            assertEquals("hao.dev7", missed.displayName); assertEquals("+84901", missed.handle); assertTrue(missed.video)
        } finally { h.scope.cancel() }
    }

    @Test fun answeredOrDeclinedCallsAreNotMissed() {
        listOf("answer", "end").forEach { type ->
            val h = ParityHarness(DtmfAdapter())
            try {
                h.ring(); h.command(type)
                runBlocking { h.ingress.remoteEnded("call-1") }
                assertEquals(emptyList(), h.presenter.missed, type)
            } finally { h.scope.cancel() }
        }
    }

    @Test fun theRingDeadlineLeavesAMissedCall() {
        val h = ParityHarness(DtmfAdapter(), ringTimeoutMs = 50)
        try {
            h.ring()
            val deadline = System.currentTimeMillis() + 2_000
            while (h.presenter.missed.isEmpty() && System.currentTimeMillis() < deadline) Thread.sleep(10)
            assertEquals("unanswered", h.call()["endReason"]); assertEquals(1, h.presenter.missed.size)
        } finally { h.scope.cancel() }
    }

    @Test fun aCallRequestIsDeliveredOnceAndExpires() {
        var signals = 0
        CallxCallRequests.setListener(null)
        CallxCallRequests.offer(CallxCallRequest("+84901", "hao.dev7", false, 1_000))
        CallxCallRequests.setListener { signals++ }
        assertEquals(1, signals, "a pending request signals the new listener")
        assertEquals("+84901", CallxCallRequests.take(1_500)?.handle)
        assertNull(CallxCallRequests.take(1_600))
        CallxCallRequests.offer(CallxCallRequest("+84902", null, true, 1_000))
        assertEquals(2, signals)
        assertNull(CallxCallRequests.take(1_000 + CallxCallRequests.RETENTION_MS))
        CallxCallRequests.setListener(null)
        CallxCallRequests.offer(CallxCallRequest("late", null, false, 2_000))
        CallxCallRequests.setListener({ signals++ }, notifyPending = false)
        assertEquals(2, signals, "JS drains the pending request after installing its event listener")
        assertEquals("late", CallxCallRequests.take(2_100)?.handle)
        CallxCallRequests.setListener(null)
    }
}
