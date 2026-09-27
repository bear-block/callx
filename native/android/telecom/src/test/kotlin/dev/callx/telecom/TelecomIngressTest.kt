package dev.callx.telecom

import android.telecom.DisconnectCause
import dev.callx.core.BridgeCapabilities
import dev.callx.core.BridgeRuntime
import dev.callx.core.CallCoordinator
import dev.callx.core.IncomingOutcome
import dev.callx.core.Invitation
import java.util.Collections
import java.util.concurrent.ConcurrentHashMap
import kotlin.test.*
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.async
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.runBlocking

private fun <T> list() = Collections.synchronizedList(mutableListOf<T>())

private class FakeHandle : TelecomCallHandle {
    val actions = list<String>()
    val disconnects = list<Int>()
    override suspend fun answer() = TelecomActionResult.Applied.also { actions += "answer" }
    override suspend fun end() = TelecomActionResult.Applied.also { actions += "end" }
    override suspend fun setHeld(held: Boolean) = TelecomActionResult.Applied.also { actions += if (held) "hold" else "active" }
    override suspend fun disconnect(code: Int) = TelecomActionResult.Applied.also { disconnects += code }
}

private class FakeSessions : IncomingTelecomSessions {
    var beforeRegister: (suspend () -> Unit)? = null
    var result: TelecomActionResult = TelecomActionResult.Applied
    val handles = ConcurrentHashMap<String, FakeHandle>()
    val registered = list<String>()
    override suspend fun reportIncoming(callId: String, displayName: String, handle: String): TelecomActionResult {
        registered += callId
        beforeRegister?.invoke()
        if (result == TelecomActionResult.Applied) handles[callId] = FakeHandle()
        return result
    }
    override fun resolve(callId: String) = handles[callId]
}

private class FakePresenter : IncomingCallPresenter {
    val incoming = list<String>(); val outgoing = list<String>(); val ongoing = list<String>(); val dismissed = list<String>()
    override fun showIncoming(invitation: Invitation) { incoming += invitation.callId }
    override fun showOutgoing(callId: String, displayName: String) { outgoing += "$callId:$displayName" }
    override fun showOngoing(callId: String) { ongoing += callId }
    override fun dismiss(callId: String) { dismissed += callId }
}

private class RecordingListener : TelecomIngressListener {
    val accepted = list<String>(); val rejected = list<Pair<String?, IncomingOutcome?>>()
    val answered = list<String>(); val ended = list<String>(); val timedOut = list<String>()
    val pushes = list<Triple<String?, Int?, Int?>>()
    override fun onPushReceived(callId: String?, priority: Int?, originalPriority: Int?) { pushes += Triple(callId, priority, originalPriority) }
    override fun onInvitationAccepted(invitation: Invitation) { accepted += invitation.callId }
    override fun onInvitationRejected(invitation: Invitation?, outcome: IncomingOutcome?) { rejected += invitation?.callId to outcome }
    override fun onUserAnswered(callId: String) { answered += callId }
    override fun onUserEnded(callId: String) { ended += callId }
    override fun onRingTimedOut(callId: String) { timedOut += callId }
}

private class FakeMedia(var accept: Boolean = true) : MediaMuteController {
    val calls = list<Boolean>()
    override suspend fun setMuted(callId: String, muted: Boolean): Boolean { calls += muted; return accept }
}

private class Harness(ringTimeoutMs: Long = 45_000, budgetMs: Long = 4_000) {
    val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    val sessions = FakeSessions()
    val presenter = FakePresenter()
    val listener = RecordingListener()
    val media = FakeMedia()
    val ingress = TelecomIngress(scope, presenter, listener, media, ringTimeoutMs, budgetMs)
    val runtime = BridgeRuntime(CallCoordinator(),
        ingress.executor(TelecomPlatformExecutor(scope, sessions, media,
            outgoing = { callId, _, _ -> sessions.handles[callId] = FakeHandle(); TelecomActionResult.Applied })),
        BridgeCapabilities("generation-1", durableReplay = true, providerManagedSignaling = false, hold = true, mute = true))
    init { ingress.attach(runtime, sessions) }

    fun state() = (runtime.getSnapshot()["call"] as Map<*, *>?)?.get("state")
    fun muted() = (runtime.getSnapshot()["call"] as Map<*, *>?)?.get("muted")
    fun command(type: String, callId: String, extra: Map<String, Any?> = emptyMap()) = runtime.execute(
        mapOf("contractVersion" to "0.1.0", "operationId" to "$type-$callId-${System.nanoTime()}", "type" to type,
            "callId" to callId) + extra).toCompletableFuture().join()
    fun host(delayMs: Long = 0, calls: MutableList<String> = list()) = object : TelecomSystemActionHandler {
        override suspend fun answer(callId: String, callType: Int) { kotlinx.coroutines.delay(delayMs); calls += "answer:$callId" }
        override suspend fun disconnect(callId: String, cause: DisconnectCause) {}
        override suspend fun setActive(callId: String) { calls += "active:$callId" }
        override suspend fun setInactive(callId: String) { calls += "inactive:$callId" }
    }
    fun endReason() = (runtime.getSnapshot()["call"] as Map<*, *>?)?.get("endReason")
    fun invitation(callId: String) = Invitation(callId, "hao.dev7", "+84901")
    fun push(callId: String) = ingress.handlePush(mapOf("callx" to
        """{"schemaVersion":1,"type":"call.invited","callId":"$callId","displayName":"hao.dev7","handle":"+84901"}"""))
}

private fun eventually(condition: () -> Boolean): Boolean {
    repeat(150) { if (condition()) return true; Thread.sleep(20) }
    return false
}

class TelecomIngressTest {
    @Test fun cancelDuringRegistrationCleansUpLatePlatformCall() = runBlocking {
        val h = Harness()
        try {
            val started = CompletableDeferred<Unit>(); val release = CompletableDeferred<Unit>()
            h.sessions.beforeRegister = { started.complete(Unit); release.await() }
            val incoming = async { h.ingress.handleInvitation(h.invitation("call-1")) }
            started.await()
            h.ingress.remoteEnded("call-1", "callerCancelled")
            release.complete(Unit)
            assertEquals(IncomingOutcome.Ended("callerCancelled"), incoming.await())
            assertTrue(h.presenter.incoming.isEmpty())
            assertTrue(h.listener.accepted.isEmpty())
            assertEquals(listOf(DisconnectCause.REMOTE), h.sessions.handles.getValue("call-1").disconnects)
            assertEquals("callerCancelled", h.endReason())
        } finally { h.scope.cancel() }
    }

    @Test fun deadlineDuringRegistrationDoesNotPostARingingNotification() = runBlocking {
        val h = Harness(ringTimeoutMs = 1)
        try {
            h.sessions.beforeRegister = { kotlinx.coroutines.delay(30) }
            assertEquals(IncomingOutcome.Ended("unanswered"), h.ingress.handleInvitation(h.invitation("call-1")))
            assertTrue(h.presenter.incoming.isEmpty())
            assertTrue(h.listener.accepted.isEmpty())
            assertEquals(listOf(DisconnectCause.MISSED), h.sessions.handles.getValue("call-1").disconnects)
        } finally { h.scope.cancel() }
    }

    @Test fun systemAnswerDuringRegistrationDoesNotRevertToIncomingPresentation() = runBlocking {
        val h = Harness()
        try {
            h.sessions.beforeRegister = { h.ingress.systemActions(h.host()).answer("call-1", 1) }
            assertEquals(IncomingOutcome.Accepted, h.ingress.handleInvitation(h.invitation("call-1")))
            assertTrue(h.presenter.incoming.isEmpty())
            assertEquals("connecting", h.state())
            assertTrue(h.presenter.ongoing.contains("call-1"))
        } finally { h.scope.cancel() }
    }

    @Test fun coldProcessRecoveryCleansUpAndCanBeRetried() = runBlocking {
        val h = Harness()
        try {
            // Stand in for a checkpoint restored before any new invitations are allowed.
            h.runtime.reportIncoming("old-call", "hao.dev7", "+84901")
            h.sessions.handles["old-call"] = FakeHandle()
            val recovered = h.ingress.recoverAfterProcessDeath()
            assertEquals("failed", recovered?.endReason)
            assertEquals(recovered, h.ingress.recoverAfterProcessDeath())
            assertEquals(listOf("old-call", "old-call"), h.presenter.dismissed)
            assertEquals(2, h.sessions.handles.getValue("old-call").disconnects.size)
            assertEquals(IncomingOutcome.Ended("failed"), h.ingress.handleInvitation(h.invitation("old-call")))
            assertEquals(IncomingOutcome.Accepted, h.ingress.handleInvitation(h.invitation("new-call")))
        } finally { h.scope.cancel() }
    }

    @Test fun pushRegistersTheCallAndShowsTheNotificationBeforeReturning() {
        val h = Harness()
        assertTrue(h.ingress.handlePush(mapOf("callx" to
            """{"schemaVersion":1,"type":"call.invited","callId":"call-1","displayName":"hao.dev7","handle":"+84901"}"""),
            priority = 2, originalPriority = 1))
        // No waiting: FCM may stop the process as soon as onMessageReceived returns.
        assertEquals(listOf("call-1"), h.listener.accepted)
        assertEquals(listOf(Triple<String?, Int?, Int?>("call-1", 2, 1)), h.listener.pushes)
        assertEquals(listOf("call-1"), h.sessions.registered)
        assertEquals(listOf("call-1"), h.presenter.incoming)
        assertEquals("incoming", h.state())
        h.scope.cancel()
    }

    @Test fun messagesWithoutAnInvitationAreLeftForTheHost() {
        val h = Harness()
        assertFalse(h.ingress.handlePush(mapOf("chat" to "hello")))
        assertTrue(h.ingress.handlePush(mapOf("callx" to "{}")))
        assertEquals(listOf<Pair<String?, IncomingOutcome?>>(null to null), h.listener.rejected)
        assertTrue(h.sessions.registered.isEmpty())
        h.scope.cancel()
    }

    @Test fun duplicateAndEndedInvitationsDoNotRegisterAgain() = runBlocking {
        val h = Harness()
        assertEquals(IncomingOutcome.Accepted, h.ingress.handleInvitation(h.invitation("call-1")))
        assertEquals(IncomingOutcome.Duplicate, h.ingress.handleInvitation(h.invitation("call-1")))
        h.ingress.remoteEnded("call-2", "callerCancelled")
        assertEquals(IncomingOutcome.Ended("callerCancelled"), h.ingress.handleInvitation(h.invitation("call-2")))
        assertEquals(listOf("call-1"), h.sessions.registered)
        h.scope.cancel()
    }

    @Test fun busyInvitationIsRecordedSoItCannotRingLater() = runBlocking {
        val h = Harness()
        h.ingress.handleInvitation(h.invitation("call-1"))
        assertEquals(IncomingOutcome.Busy, h.ingress.handleInvitation(h.invitation("call-3")))
        h.ingress.remoteEnded("call-1")
        assertEquals(IncomingOutcome.Ended("busy"), h.ingress.handleInvitation(h.invitation("call-3")))
        h.scope.cancel()
    }

    @Test fun telecomRefusalLeavesNoRingingCall() = runBlocking {
        val h = Harness()
        h.sessions.result = TelecomActionResult.Rejected()
        h.ingress.handleInvitation(h.invitation("call-1"))
        assertEquals(listOf<Pair<String?, IncomingOutcome?>>("call-1" to null), h.listener.rejected)
        assertTrue(h.presenter.incoming.isEmpty())
        assertEquals("failed", h.endReason())
        h.scope.cancel()
    }

    @Test fun ringDeadlineDisconnectsTheCallAsMissed() = runBlocking {
        val h = Harness(ringTimeoutMs = 50)
        h.ingress.handleInvitation(h.invitation("call-1"))
        assertTrue(eventually { h.listener.timedOut == listOf("call-1") })
        assertEquals(listOf(DisconnectCause.MISSED), h.sessions.handles.getValue("call-1").disconnects)
        assertEquals(listOf("call-1"), h.presenter.dismissed)
        assertEquals("unanswered", h.endReason())
        h.scope.cancel()
    }

    @Test fun notificationAnswerRunsTheTelecomAnswer() = runBlocking {
        val h = Harness()
        h.ingress.handleInvitation(h.invitation("call-1"))
        h.ingress.onNotificationAction("call-1", TelecomIngress.ACTION_ANSWER)
        assertTrue(eventually { h.listener.answered == listOf("call-1") })
        assertEquals(listOf("answer"), h.sessions.handles.getValue("call-1").actions)
        assertEquals(listOf("call-1"), h.presenter.ongoing)
        assertEquals("connecting", h.state())
        h.scope.cancel()
    }

    @Test fun notificationDeclineEndsTheCall() = runBlocking {
        val h = Harness()
        h.ingress.handleInvitation(h.invitation("call-1"))
        h.ingress.onNotificationAction("call-1", TelecomIngress.ACTION_DECLINE)
        assertTrue(eventually { h.listener.ended == listOf("call-1") })
        assertEquals(listOf("end"), h.sessions.handles.getValue("call-1").actions)
        assertEquals("declined", h.endReason())
        assertEquals(listOf("call-1"), h.presenter.dismissed)
        h.scope.cancel()
    }

    @Test fun remoteEndDisconnectsTheTelecomCall() = runBlocking {
        val h = Harness()
        h.ingress.handleInvitation(h.invitation("call-1"))
        h.ingress.remoteEnded("call-1", "answeredElsewhere")
        assertEquals(listOf(DisconnectCause.REMOTE), h.sessions.handles.getValue("call-1").disconnects)
        assertEquals("answeredElsewhere", h.endReason())
        h.scope.cancel()
    }

    @Test fun systemSurfaceAnswerReachesTheCoordinator() = runBlocking {
        val h = Harness()
        val host = list<String>()
        val wrapped = h.ingress.systemActions(h.host(calls = host))
        h.ingress.handleInvitation(h.invitation("call-1"))
        wrapped.answer("call-1", 1)
        assertEquals(listOf("answer:call-1"), host)
        assertEquals("connecting", h.state())
        assertEquals(listOf("call-1"), h.presenter.ongoing)
        h.scope.cancel()
    }

    @Test fun remoteAnswerActivatesTheOutgoingCall() = runBlocking {
        val h = Harness()
        val result = h.runtime.execute(mapOf("contractVersion" to "0.1.0", "operationId" to "start", "type" to "startCall",
            "input" to mapOf("callId" to "call-out", "displayName" to "hao.dev7", "handle" to "+84901")))
            .toCompletableFuture().join()
        assertEquals("applied", result["status"])
        h.ingress.remoteAnswered("call-out")
        assertEquals(listOf("active"), h.sessions.handles.getValue("call-out").actions)
        assertEquals("connecting", h.state())
        h.scope.cancel()
    }

    @Test fun appAnswerAndEndKeepTheNotificationInStep() = runBlocking {
        val h = Harness()
        h.ingress.handleInvitation(h.invitation("call-1"))
        assertEquals("applied", h.command("answer", "call-1")["status"])
        assertTrue(eventually { h.presenter.ongoing == listOf("call-1") })
        assertEquals("applied", h.command("end", "call-1")["status"])
        assertTrue(eventually { h.presenter.dismissed == listOf("call-1") })
        h.scope.cancel()
    }

    @Test fun outgoingCallGetsANotification() = runBlocking {
        val h = Harness()
        val result = h.runtime.execute(mapOf("contractVersion" to "0.1.0", "operationId" to "start", "type" to "startCall",
            "input" to mapOf("callId" to "call-out", "displayName" to "hao.dev7", "handle" to "+84901")))
            .toCompletableFuture().join()
        assertEquals("applied", result["status"])
        assertTrue(eventually { h.presenter.outgoing == listOf("call-out:hao.dev7") })
        h.scope.cancel()
    }

    @Test fun slowHostAnswerFailsWithinTheBudgetAndIsNotRecorded() = runBlocking {
        val h = Harness(budgetMs = 100)
        h.ingress.handleInvitation(h.invitation("call-1"))
        val wrapped = h.ingress.systemActions(h.host(delayMs = 2_000))
        val started = System.currentTimeMillis()
        assertFailsWith<IllegalStateException> { wrapped.answer("call-1", 1) }
        assertTrue(System.currentTimeMillis() - started < 1_000)
        assertEquals("incoming", h.state())
        h.scope.cancel()
    }

    @Test fun systemHoldAndResumeAreRecorded() = runBlocking {
        val h = Harness()
        val host = list<String>()
        val wrapped = h.ingress.systemActions(h.host(calls = host))
        h.ingress.handleInvitation(h.invitation("call-1"))
        wrapped.answer("call-1", 1)
        h.runtime.mediaConnected("call-1")
        wrapped.setInactive("call-1")
        assertEquals("held", h.state())
        wrapped.setActive("call-1")
        assertEquals("active", h.state())
        assertEquals(listOf("answer:call-1", "inactive:call-1", "active:call-1"), host)
        h.scope.cancel()
    }

    @Test fun systemMuteIsAppliedToMediaOnce() = runBlocking {
        val h = Harness()
        h.ingress.handleInvitation(h.invitation("call-1"))
        h.ingress.systemActions(h.host()).answer("call-1", 1)
        // Telecom's Flow emits the current value first, then each change, in order.
        for (muted in listOf(false, true, true, false)) h.ingress.audioObserver.onMuteChanged("call-1", muted)
        assertEquals(listOf(true, false), h.media.calls)
        assertEquals(false, h.muted())
        h.scope.cancel()
    }

    @Test fun systemMuteIsRevertedWhenMediaCannotFollow() = runBlocking {
        val h = Harness()
        h.media.accept = false
        h.ingress.handleInvitation(h.invitation("call-1"))
        h.ingress.systemActions(h.host()).answer("call-1", 1)
        h.ingress.audioObserver.onMuteChanged("call-1", true)
        assertEquals(listOf(true), h.media.calls)
        assertEquals(false, h.muted())
        h.scope.cancel()
    }
}
