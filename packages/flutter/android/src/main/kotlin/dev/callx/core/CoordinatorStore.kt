package dev.callx.core

import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.StandardCopyOption.ATOMIC_MOVE
import java.nio.file.StandardCopyOption.REPLACE_EXISTING
import kotlinx.serialization.json.*

data class CompletedOperation(val command: NativeCommand, val result: NativeOperation)
data class CoordinatorCheckpoint(val schemaVersion: Int = 1, val call: CallRecord?,
    val pending: List<NativeCommand>, val completed: List<CompletedOperation>, val journal: JournalCheckpoint? = null)

interface CoordinatorStore { fun save(checkpoint: CoordinatorCheckpoint); fun load(): CoordinatorCheckpoint? }

class CoordinatorFileStore(private val path: Path) : CoordinatorStore {
    override fun save(checkpoint: CoordinatorCheckpoint) {
        Files.createDirectories(path.parent)
        val temporary = path.resolveSibling("${path.fileName}.tmp")
        Files.write(temporary, CoordinatorCheckpointCodec.encode(checkpoint).toString().toByteArray())
        Files.move(temporary, path, ATOMIC_MOVE, REPLACE_EXISTING)
    }
    override fun load(): CoordinatorCheckpoint? {
        if (!Files.exists(path)) return null
        return CoordinatorCheckpointCodec.decode(Json.parseToJsonElement(String(Files.readAllBytes(path))).jsonObject)
    }
}

object CoordinatorCheckpointCodec {
    fun encode(value: CoordinatorCheckpoint) = buildJsonObject {
        put("schemaVersion", value.schemaVersion)
        value.call?.let { put("call", encodeCall(it)) }
        putJsonArray("pending") { value.pending.forEach { add(encodeCommand(it)) } }
        putJsonArray("completed") { value.completed.forEach { item -> add(buildJsonObject {
            put("command", encodeCommand(item.command)); put("result", encodeResult(item.result))
        }) } }
        value.journal?.let { put("journal", JournalCodec.encode(it)) }
    }
    fun decode(value: JsonObject): CoordinatorCheckpoint {
        val schema = value.getValue("schemaVersion").jsonPrimitive.int
        if (schema != 1) throw StoreViolation("Unsupported checkpoint schema $schema")
        return CoordinatorCheckpoint(schema,
            value["call"]?.takeUnless { it is JsonNull }?.jsonObject?.let(::decodeCall),
            value.getValue("pending").jsonArray.map { decodeCommand(it.jsonObject) },
            value.getValue("completed").jsonArray.map { item -> item.jsonObject.let {
                CompletedOperation(decodeCommand(it.getValue("command").jsonObject), decodeResult(it.getValue("result").jsonObject))
            } }, value["journal"]?.jsonObject?.let(JournalCodec::decode))
    }
    private fun encodeCall(value: CallRecord) = buildJsonObject {
        put("callId", value.callId); put("state", value.state.name); put("muted", value.muted); put("mediaReady", value.mediaReady)
        value.endReason?.let { put("endReason", it) }
    }
    private fun decodeCall(value: JsonObject) = CallRecord(value.text("callId"), CallState.valueOf(value.text("state")),
        value.getValue("muted").jsonPrimitive.boolean, value.getValue("mediaReady").jsonPrimitive.boolean,
        value["endReason"]?.jsonPrimitive?.contentOrNull)
    private fun encodeCommand(value: NativeCommand) = buildJsonObject {
        put("operationId", value.operationId); put("type", value.type.name); put("callId", value.callId)
        value.value?.let { put("value", it) }; value.displayName?.let { put("displayName", it) }
        value.handle?.let { put("handle", it) }; put("deadlineAtMs", value.deadlineAtMs)
    }
    private fun decodeCommand(value: JsonObject) = NativeCommand(value.text("operationId"),
        CommandType.valueOf(value.text("type")), value.text("callId"), value["value"]?.jsonPrimitive?.booleanOrNull,
        value["displayName"]?.jsonPrimitive?.contentOrNull, value["handle"]?.jsonPrimitive?.contentOrNull,
        value.getValue("deadlineAtMs").jsonPrimitive.long)
    private fun encodeResult(value: NativeOperation) = buildJsonObject {
        put("operationId", value.operationId); put("status", value.status.name); value.errorCode?.let { put("errorCode", it) }
    }
    private fun decodeResult(value: JsonObject) = NativeOperation(value.text("operationId"),
        OperationStatus.valueOf(value.text("status")), value["errorCode"]?.jsonPrimitive?.contentOrNull)
    private fun JsonObject.text(key: String) = getValue(key).jsonPrimitive.content
}

class StoreViolation(message: String) : IllegalStateException(message)
