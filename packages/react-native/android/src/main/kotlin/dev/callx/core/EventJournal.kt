package dev.callx.core

import kotlinx.serialization.json.*

data class JournalEvent(val eventId: String, val sequence: Long, val kind: String,
    val observedAtMs: Long, val callId: String? = null, val operationId: String? = null)
data class JournalCheckpoint(var nextSequence: Long = 1, var acknowledged: Long = 0,
    val events: MutableList<JournalEvent> = mutableListOf())
sealed interface ReplayOutcome {
    data class Replay(val events: List<JournalEvent>) : ReplayOutcome
    data object Gap : ReplayOutcome
}

class EventJournal(val state: JournalCheckpoint = JournalCheckpoint()) {
    companion object { const val RETENTION_MS = 86_400_000L; const val EVENT_QUOTA = 2_048; const val BYTE_QUOTA = 2_097_152 }
    fun append(kind: String, observedAtMs: Long, callId: String? = null, operationId: String? = null): JournalEvent {
        val sequence = state.nextSequence++
        val event = JournalEvent("event-$sequence", sequence, kind, observedAtMs, callId, operationId)
        state.events += event; prune(observedAtMs); return event
    }
    fun acknowledge(through: Long) {
        if (through < state.acknowledged || through >= state.nextSequence) throw JournalViolation("Invalid acknowledgement")
        state.acknowledged = through
    }
    fun replay(after: Long): ReplayOutcome {
        val last = state.nextSequence - 1
        if (after > last || (state.events.firstOrNull()?.sequence?.let { after + 1 < it } == true)) return ReplayOutcome.Gap
        return ReplayOutcome.Replay(state.events.filter { it.sequence > after })
    }
    fun prune(nowMs: Long) {
        while (state.events.firstOrNull()?.let { nowMs - it.observedAtMs >= RETENTION_MS } == true) state.events.removeFirst()
        while (state.events.size > EVENT_QUOTA) state.events.removeFirst()
        while (state.events.size > 1 && JournalCodec.encode(state).toString().toByteArray().size > BYTE_QUOTA) state.events.removeFirst()
    }
}
class JournalViolation(message: String) : IllegalArgumentException(message)

object JournalCodec {
    fun encode(value: JournalCheckpoint) = buildJsonObject {
        put("nextSequence", value.nextSequence); put("acknowledged", value.acknowledged)
        putJsonArray("events") { value.events.forEach { event -> add(buildJsonObject {
            put("eventId", event.eventId); put("sequence", event.sequence); put("kind", event.kind); put("observedAtMs", event.observedAtMs)
            event.callId?.let { put("callId", it) }; event.operationId?.let { put("operationId", it) }
        }) } }
    }
    fun decode(value: JsonObject) = JournalCheckpoint(value.getValue("nextSequence").jsonPrimitive.long,
        value.getValue("acknowledged").jsonPrimitive.long, value.getValue("events").jsonArray.map { item -> item.jsonObject.let {
            JournalEvent(it.text("eventId"), it.getValue("sequence").jsonPrimitive.long, it.text("kind"),
                it.getValue("observedAtMs").jsonPrimitive.long, it["callId"]?.jsonPrimitive?.contentOrNull,
                it["operationId"]?.jsonPrimitive?.contentOrNull)
        } }.toMutableList())
    private fun JsonObject.text(key: String) = getValue(key).jsonPrimitive.content
}
