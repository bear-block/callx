package dev.callx.telecom

import android.telecom.DisconnectCause
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlinx.coroutines.runBlocking

class CoreTelecomCallHandleTest {
    private class Harness(
        var ringing: Boolean = true,
        var answerResult: TelecomActionResult = TelecomActionResult.Applied,
        var answerError: Exception? = null,
    ) {
        val disconnects = mutableListOf<Int>()
        val handle = CoreTelecomCallHandle(
            answerCall = { answerError?.let { throw it }; answerResult },
            disconnectCall = { disconnects.add(it); TelecomActionResult.Applied },
            changeHold = { TelecomActionResult.Applied },
            isIncomingRinging = { ringing },
        )
    }

    @Test fun endingUnansweredIncomingCallDeclines() = runBlocking {
        val h = Harness()
        h.handle.end()
        assertEquals(listOf(DisconnectCause.REJECTED), h.disconnects)
    }

    @Test fun answerThenEndIsLocalHangupEvenWithOriginalIncomingPredicate() = runBlocking {
        val h = Harness()
        assertEquals(TelecomActionResult.Applied, h.handle.answer())
        h.handle.setHeld(true)
        h.handle.setHeld(false)
        h.handle.end()
        assertEquals(listOf(DisconnectCause.LOCAL), h.disconnects)
    }

    @Test fun rejectedAnswerDoesNotStopRinging() = runBlocking {
        val h = Harness(answerResult = TelecomActionResult.Rejected(7))
        assertEquals(TelecomActionResult.Rejected(7), h.handle.answer())
        h.handle.end()
        assertEquals(listOf(DisconnectCause.REJECTED), h.disconnects)
    }

    @Test fun failedAnswerDoesNotStopRinging() = runBlocking {
        val h = Harness(answerError = IllegalStateException("platform unavailable"))
        assertFailsWith<IllegalStateException> { h.handle.answer() }
        h.handle.end()
        assertEquals(listOf(DisconnectCause.REJECTED), h.disconnects)
    }

    @Test fun systemAnswerUpdatesTheSharedRingingPredicate() = runBlocking {
        val h = Harness()
        // Session manager clears this only after its system answer handler succeeds.
        h.ringing = false
        h.handle.end()
        assertEquals(listOf(DisconnectCause.LOCAL), h.disconnects)
    }

    @Test fun outgoingHangupIsNeverADecline() = runBlocking {
        val h = Harness(ringing = false)
        h.handle.end()
        assertEquals(listOf(DisconnectCause.LOCAL), h.disconnects)
    }
}
