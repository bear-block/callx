package dev.callx.core

import java.io.File
import kotlinx.serialization.json.*
import kotlin.test.*

class InvitationFixtureTest {
    private val fixtures = Json.parseToJsonElement(
        File(File("../..").canonicalFile, "contracts/invitation-v1/fixtures.json").readText()).jsonObject

    @Test fun validFixturesDecodeToTheExpectedInvitation() {
        fixtures.getValue("valid").jsonArray.map { it.jsonObject }.forEach { fixture ->
            val expected = fixture.getValue("expected").jsonObject
            fun text(key: String) = expected[key]?.jsonPrimitive?.content
            fun number(key: String) = expected[key]?.jsonPrimitive?.long
            val wanted = Invitation(text("callId")!!, text("displayName")!!, text("handle")!!, text("eventId"),
                text("revision"), number("issuedAtMs"), number("expiresAtMs"))
            // FCM data values are strings, so the invitation arrives as JSON text under "callx".
            val data = mapOf("callx" to fixture.getValue("payload").toString(), "other" to "ignored")
            assertEquals(wanted, InvitationCodec.decodeData(data), fixture.getValue("name").jsonPrimitive.content)
        }
    }

    @Test fun invalidFixturesAreRejected() {
        fixtures.getValue("invalid").jsonArray.map { it.jsonObject }.forEach { fixture ->
            assertFailsWith<InvitationViolation>(fixture.getValue("name").jsonPrimitive.content) {
                InvitationCodec.decode(fixture.getValue("payload").toString())
            }
        }
        assertFailsWith<InvitationViolation> { InvitationCodec.decode("not json") }
        assertFailsWith<InvitationViolation> { InvitationCodec.decode("[]") }
    }

    @Test fun messagesWithoutTheCallxKeyBelongToTheHost() {
        assertNull(InvitationCodec.decodeData(mapOf("chat" to "hello")))
    }
}
