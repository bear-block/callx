package dev.callx.core

import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.StandardCopyOption.ATOMIC_MOVE
import java.nio.file.StandardCopyOption.REPLACE_EXISTING
import kotlinx.serialization.json.*

data class CompletedOperation(val command: NativeCommand, val result: NativeOperation)
data class CoordinatorCheckpoint(val schemaVersion: Int = 1, val call: CallRecord?,
    val pending: List<NativeCommand>, val completed: List<CompletedOperation>, val journal: JournalCheckpoint? = null,
    val terminal: List<TerminalRecord> = emptyList())

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
        putJsonArray("terminal") { value.terminal.forEach { item -> add(buildJsonObject {
            put("callId", item.callId); put("reason", item.reason); put("endedAtMs", item.endedAtMs)
        }) } }
    }
    fun decode(value: JsonObject): CoordinatorCheckpoint {
        val schema = value.getValue("schemaVersion").jsonPrimitive.int
        if (schema != 1) throw StoreViolation("Unsupported checkpoint schema $schema")
        return CoordinatorCheckpoint(schema,
            value["call"]?.takeUnless { it is JsonNull }?.jsonObject?.let(::decodeCall),
            value.getValue("pending").jsonArray.map { decodeCommand(it.jsonObject) },
            value.getValue("completed").jsonArray.map { item -> item.jsonObject.let {
                CompletedOperation(decodeCommand(it.getValue("command").jsonObject), decodeResult(it.getValue("result").jsonObject))
            } }, value["journal"]?.jsonObject?.let(JournalCodec::decode),
            value["terminal"]?.jsonArray?.map { item -> item.jsonObject.let {
                TerminalRecord(it.text("callId"), it.text("reason"), it.getValue("endedAtMs").jsonPrimitive.long)
            } }.orEmpty())
    }
    private fun encodeCall(value: CallRecord) = buildJsonObject {
        put("callId", value.callId); put("state", value.state.name); put("muted", value.muted); put("mediaReady", value.mediaReady)
        value.endReason?.let { put("endReason", it) }
        value.displayName?.let { put("displayName", it) }; value.handle?.let { put("handle", it) }
        value.direction?.let { put("direction", it.name) }
        value.createdAtMs?.let { put("createdAtMs", it) }; value.acceptedAtMs?.let { put("acceptedAtMs", it) }
        value.mediaConnectedAtMs?.let { put("mediaConnectedAtMs", it) }; value.endedAtMs?.let { put("endedAtMs", it) }
        value.ringDeadlineAtMs?.let { put("ringDeadlineAtMs", it) }
        if (value.mediaInterrupted) put("mediaInterrupted", true)
        if (value.video) put("video", true)
        if (value.localVideo != LocalVideo.off) put("localVideo", value.localVideo.name)
        value.cameraFacing?.let { put("cameraFacing", it.name) }
        if (value.remoteVideo) put("remoteVideo", true)
        if (value.audioRoutes.isNotEmpty()) putJsonArray("audioRoutes") { value.audioRoutes.forEach { route -> add(buildJsonObject {
            put("id", route.id); put("kind", route.kind.name); put("name", route.name)
        }) } }
        value.audioRoute?.let { put("audioRoute", it) }
    }
    private fun decodeCall(value: JsonObject) = CallRecord(value.text("callId"), CallState.valueOf(value.text("state")),
        value.getValue("muted").jsonPrimitive.boolean, value.getValue("mediaReady").jsonPrimitive.boolean,
        value["endReason"]?.jsonPrimitive?.contentOrNull, value["displayName"]?.jsonPrimitive?.contentOrNull,
        value["handle"]?.jsonPrimitive?.contentOrNull,
        value["direction"]?.jsonPrimitive?.contentOrNull?.let(CallDirection::valueOf),
        value["createdAtMs"]?.jsonPrimitive?.longOrNull, value["acceptedAtMs"]?.jsonPrimitive?.longOrNull,
        value["mediaConnectedAtMs"]?.jsonPrimitive?.longOrNull, value["endedAtMs"]?.jsonPrimitive?.longOrNull,
        value["ringDeadlineAtMs"]?.jsonPrimitive?.longOrNull,
        value["mediaInterrupted"]?.jsonPrimitive?.booleanOrNull ?: false,
        value["video"]?.jsonPrimitive?.booleanOrNull ?: false,
        value["localVideo"]?.jsonPrimitive?.contentOrNull?.let(LocalVideo::valueOf) ?: LocalVideo.off,
        value["cameraFacing"]?.jsonPrimitive?.contentOrNull?.let(CameraFacing::valueOf),
        value["remoteVideo"]?.jsonPrimitive?.booleanOrNull ?: false,
        value["audioRoutes"]?.jsonArray?.map { item -> item.jsonObject.let {
            AudioRoute(it.text("id"), AudioRouteKind.valueOf(it.text("kind")), it.text("name"))
        } }.orEmpty(),
        value["audioRoute"]?.jsonPrimitive?.contentOrNull)
    private fun encodeCommand(value: NativeCommand) = buildJsonObject {
        put("operationId", value.operationId); put("type", value.type.name); put("callId", value.callId)
        value.value?.let { put("value", it) }; value.displayName?.let { put("displayName", it) }
        value.handle?.let { put("handle", it) }; put("deadlineAtMs", value.deadlineAtMs)
        if (value.video) put("video", true); value.facing?.let { put("facing", it.name) }
        value.audioRoute?.let { put("audioRoute", it) }; value.digits?.let { put("digits", it) }
    }
    private fun decodeCommand(value: JsonObject) = NativeCommand(value.text("operationId"),
        CommandType.valueOf(value.text("type")), value.text("callId"), value["value"]?.jsonPrimitive?.booleanOrNull,
        value["displayName"]?.jsonPrimitive?.contentOrNull, value["handle"]?.jsonPrimitive?.contentOrNull,
        value.getValue("deadlineAtMs").jsonPrimitive.long,
        value["video"]?.jsonPrimitive?.booleanOrNull ?: false,
        value["facing"]?.jsonPrimitive?.contentOrNull?.let(CameraFacing::valueOf),
        value["audioRoute"]?.jsonPrimitive?.contentOrNull, value["digits"]?.jsonPrimitive?.contentOrNull)
    private fun encodeResult(value: NativeOperation) = buildJsonObject {
        put("operationId", value.operationId); put("status", value.status.name); value.errorCode?.let { put("errorCode", it) }
        value.completedAtMs?.let { put("completedAtMs", it) }
    }
    private fun decodeResult(value: JsonObject) = NativeOperation(value.text("operationId"),
        OperationStatus.valueOf(value.text("status")), value["errorCode"]?.jsonPrimitive?.contentOrNull,
        value["completedAtMs"]?.jsonPrimitive?.longOrNull)
    private fun JsonObject.text(key: String) = getValue(key).jsonPrimitive.content
}

class StoreViolation(message: String) : IllegalStateException(message)
