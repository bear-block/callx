package dev.callx.livekit

import kotlin.test.*

class LiveKitTokenEndpointTest {
    @Test fun theRequestCarriesTheCallId() {
        assertEquals("""{"callId":"call-1"}""", LiveKitTokenEndpoint.requestBody("call-1"))
    }

    @Test fun aSuccessfulAnswerGivesTheRoomCredentials() {
        assertEquals(LiveKitCredentials("wss://media.example.com", "jwt"),
            LiveKitTokenEndpoint.parse(200, """{"url":"wss://media.example.com","token":"jwt","ttl":60}"""))
    }

    @Test fun failuresSayWhatWentWrong() {
        assertTrue(assertFailsWith<IllegalStateException> { LiveKitTokenEndpoint.parse(401, "") }.message!!.contains("401"))
        assertTrue(assertFailsWith<IllegalStateException> { LiveKitTokenEndpoint.parse(200, "<html>") }.message!!.contains("invalid JSON"))
        assertTrue(assertFailsWith<IllegalStateException> { LiveKitTokenEndpoint.parse(200, """{"url":"wss://x"}""") }
            .message!!.contains("lacks url or token"))
    }
}
