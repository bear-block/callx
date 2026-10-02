package dev.callx.core

import kotlinx.serialization.json.*

/** A `call.invited` event (schema v1 of the signaling recipe) after validation. */
data class Invitation(val callId: String, val displayName: String, val handle: String,
    val eventId: String? = null, val revision: String? = null,
    val issuedAtMs: Long? = null, val expiresAtMs: Long? = null,
    /** Report the call to the OS as a video call (ADR-0010). */
    val video: Boolean = false)

class InvitationViolation(message: String) : IllegalArgumentException(message)

object InvitationCodec {
    /** The FCM data key, or APNs payload key, that carries the invitation. */
    const val PAYLOAD_KEY = "callx"
    private const val MAX_SAFE = 9_007_199_254_740_991L
    private val ID = Regex("^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")
    private val DECIMAL = Regex("^(0|[1-9][0-9]{0,19})$")

    /** Returns null when the FCM data map carries no Callx invitation, so the host can handle it. */
    fun decodeData(data: Map<String, String>): Invitation? = data[PAYLOAD_KEY]?.let(::decode)

    fun decode(json: String): Invitation {
        val value = try { Json.parseToJsonElement(json) } catch (error: Exception) { invalid("payload is not JSON") }
        val payload = value as? JsonObject ?: invalid("payload must be an object")
        if (integer(payload, "schemaVersion") != 1L) invalid("schemaVersion must be 1")
        if (text(payload, "type") != "call.invited") invalid("type must be call.invited")
        return Invitation(
            callId = id(payload, "callId") ?: invalid("callId is required"),
            displayName = bounded(payload, "displayName") ?: invalid("displayName is required"),
            handle = bounded(payload, "handle") ?: invalid("handle is required"),
            eventId = id(payload, "eventId"),
            revision = text(payload, "revision")?.also { if (!DECIMAL.matches(it)) invalid("revision is invalid") },
            issuedAtMs = timestamp(payload, "issuedAtMs"),
            expiresAtMs = timestamp(payload, "expiresAtMs"),
            video = flag(payload, "video"),
        )
    }

    private fun text(payload: JsonObject, key: String): String? {
        val value = payload[key] ?: return null
        val primitive = value as? JsonPrimitive
        if (primitive == null || !primitive.isString) invalid("$key must be a string")
        return primitive.content
    }
    private fun id(payload: JsonObject, key: String) = text(payload, key)?.also {
        if (!ID.matches(it) || it.toByteArray().size > 128) invalid("$key is invalid")
    }
    private fun bounded(payload: JsonObject, key: String) = text(payload, key)?.also {
        if (it.isEmpty() || it.toByteArray().size > 256) invalid("$key is invalid")
    }
    private fun integer(payload: JsonObject, key: String): Long? {
        val value = payload[key] ?: return null
        val primitive = value as? JsonPrimitive ?: invalid("$key must be an integer")
        if (primitive.isString || primitive.booleanOrNull != null) invalid("$key must be an integer")
        return primitive.longOrNull ?: invalid("$key must be an integer")
    }
    private fun timestamp(payload: JsonObject, key: String) = integer(payload, key)?.also {
        if (it < 0 || it > MAX_SAFE) invalid("$key is out of range")
    }
    private fun flag(payload: JsonObject, key: String): Boolean {
        val value = payload[key] ?: return false
        val primitive = value as? JsonPrimitive
        if (primitive == null || primitive.isString) invalid("$key must be a boolean")
        return primitive.booleanOrNull ?: invalid("$key must be a boolean")
    }
    private fun invalid(message: String): Nothing = throw InvitationViolation(message)
}
