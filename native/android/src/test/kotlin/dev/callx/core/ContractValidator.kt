package dev.callx.core

import kotlinx.serialization.json.*

class ContractViolation(message: String) : IllegalArgumentException(message)

class ContractValidator(private val manifest: JsonObject) {
    private val version = manifest.string("contractVersion")
    private val limits = manifest.objectValue("limits")
    private val idRegex = Regex(limits.string("identifierPattern"))
    private val idMax = limits.int("identifierMaxUtf8Bytes")
    private fun values(key: String) = manifest.array(key).map { it.jsonPrimitive.content }.toSet()
    private val states = values("callStates"); private val directions = values("callDirections")
    private val reasons = values("endReasons"); private val commands = values("commandTypes")
    private val statuses = values("commandStatuses"); private val errors = values("errorCodes")
    private val events = values("eventKinds"); private val sources = values("eventSources")
    private val lookups = values("operationLookupStatuses"); private val sessions = values("sessionOpenStatuses")
    private val localVideoStates = values("localVideoStates"); private val facings = values("cameraFacings")
    private val routeKinds = values("audioRouteKinds"); private val dtmf = Regex(manifest.string("dtmfDigitPattern"))
    private val routeNameMax = limits.int("audioRouteNameMaxUtf8Bytes")
    private fun text(value: JsonElement?, maxBytes: Int, path: String) {
        val text = value?.jsonPrimitive?.takeIf { it.isString }?.content
        require(text != null && text.isNotEmpty() && text.toByteArray().size <= maxBytes, "$path invalid text")
    }

    fun fixture(value: JsonObject) {
        value["command"]?.jsonObject?.let(::command); value["result"]?.jsonObject?.let(::result)
        value["call"]?.jsonObject?.let { call(it, "call") }; value["snapshot"]?.jsonObject?.let(::snapshot)
        value["event"]?.jsonObject?.let(::event); value["operationLookup"]?.jsonObject?.let(::lookup)
        value["session"]?.jsonObject?.let(::session)
    }
    private fun version(value: JsonObject, path: String) = require(value.string("contractVersion") == version, "$path incompatible")
    private fun id(value: JsonElement?, path: String) {
        val text = value?.jsonPrimitive?.contentOrNull
        require(text != null && text.toByteArray().size <= idMax && idRegex.matches(text), "$path invalid identifier")
    }
    private fun member(value: JsonElement?, allowed: Set<String>, path: String) =
        require(value?.jsonPrimitive?.contentOrNull in allowed, "$path unsupported")
    private fun timestamp(value: JsonElement?, path: String) {
        val primitive = value?.jsonPrimitive ?: throw ContractViolation("$path missing")
        val number = primitive.longOrNull
        require(!primitive.isString && number != null && number >= 0 && number <= 9_007_199_254_740_991, "$path invalid timestamp")
    }
    private fun counter(value: JsonElement?, path: String) {
        val primitive = value?.jsonPrimitive
        require(primitive?.isString == true && primitive.content.matches(Regex("^(0|[1-9][0-9]*)$")), "$path invalid counter")
    }
    private fun boolean(value: JsonElement?, path: String) = require(value?.jsonPrimitive?.booleanOrNull != null, "$path boolean")
    private fun command(value: JsonObject) {
        version(value, "command.version"); id(value["operationId"], "command.operationId"); member(value["type"], commands, "command.type")
        value["deadlineAtMs"]?.let { timestamp(it, "command.deadline") }
        val type = value.string("type")
        if (type == "startCall") {
            val input = value.objectValue("input"); id(input["callId"], "command.input.callId")
            val name = input.string("displayName"); require(name.isNotEmpty() && name.toByteArray().size <= 256, "displayName invalid")
            val handle = input.string("handle"); require(handle.isNotEmpty() && handle.toByteArray().size <= 256, "handle invalid")
            require(value["callId"] == null && value["value"] == null, "startCall forbidden fields")
            input["video"]?.let { boolean(it, "command.input.video") }
        } else {
            id(value["callId"], "command.callId")
            when (type) {
                "switchCamera" -> member(value["value"], facings, "command.value")
                "setAudioRoute" -> text(value["value"], idMax, "command.value")
                "sendDtmf" -> require(value["value"]?.jsonPrimitive?.takeIf { it.isString }?.content?.let(dtmf::matches) == true, "dtmf digits")
                "setDisplayName" -> text(value["value"], 256, "command.value")
                in setOf("setMuted", "setHeld", "setCamera") -> boolean(value["value"], "command.value")
                else -> require(value["value"] == null, "value forbidden")
            }
            require(value["input"] == null, "input forbidden")
        }
    }
    private fun result(value: JsonObject) {
        version(value, "result.version"); id(value["operationId"], "result.operationId"); member(value["status"], statuses, "result.status")
        timestamp(value["completedAtMs"], "result.completedAtMs")
        if (value.string("status") == "applied") require(value["error"] == null, "applied error") else {
            val error = value.objectValue("error"); member(error["code"], errors, "error.code")
            val message = error.string("message"); require(message.isNotEmpty() && message.toByteArray().size <= 512, "message invalid")
            boolean(error["retryable"], "error.retryable")
            if (value.string("status") == "timedOut") require(error.string("code") == "deadlineExceeded", "timeout code")
        }
    }
    private fun call(value: JsonObject, path: String) {
        id(value["callId"], "$path.callId"); member(value["direction"], directions, "$path.direction"); member(value["state"], states, "$path.state")
        boolean(value["muted"], "$path.muted"); boolean(value["mediaReady"], "$path.mediaReady")
        val state = value.string("state"); if (state == "active") { require(value["mediaReady"]?.jsonPrimitive?.boolean == true, "active media"); require(value["mediaConnectedAtMs"] != null, "active milestone") }
        if (state == "ended") member(value["endReason"], reasons, "$path.endReason") else require(value["endReason"] == null, "live reason")
        value["mediaInterrupted"]?.let { boolean(it, "$path.mediaInterrupted")
            if (it.jsonPrimitive.boolean) require(state in setOf("active", "held") && value["mediaReady"]?.jsonPrimitive?.boolean == true, "interrupted media") }
        listOf("video", "remoteVideo").forEach { field -> value[field]?.let { boolean(it, "$path.$field") } }
        value["localVideo"]?.let { member(it, localVideoStates, "$path.localVideo") }
        val cameraLive = value["localVideo"]?.let { it.jsonPrimitive.content != "off" } == true
        if (cameraLive) member(value["cameraFacing"], facings, "$path.cameraFacing")
        else require(value["cameraFacing"] == null, "cameraFacing needs a camera that is not off")
        val routeIds = value["audioRoutes"]?.jsonArray?.mapIndexed { index, item ->
            val route = item.jsonObject; text(route["id"], idMax, "$path.audioRoutes[$index].id")
            member(route["kind"], routeKinds, "$path.audioRoutes[$index].kind"); text(route["name"], routeNameMax, "$path.audioRoutes[$index].name")
            route.string("id")
        }.orEmpty()
        require(routeIds.toSet().size == routeIds.size, "audio route ids unique")
        value["audioRoute"]?.let { text(it, idMax, "$path.audioRoute"); require(it.jsonPrimitive.content in routeIds, "audioRoute listed") }
        listOf("createdAtMs", "acceptedAtMs", "mediaConnectedAtMs", "endedAtMs").forEach { field -> value[field]?.let { timestamp(it, "$path.$field") } }
    }
    private fun snapshot(value: JsonObject) {
        version(value, "snapshot.version"); counter(value["watermark"], "snapshot.watermark"); val calls = value.array("calls")
        require(calls.size <= 1, "too many calls"); calls.forEachIndexed { index, item -> call(item.jsonObject, "snapshot.calls[$index]") }
    }
    private fun event(value: JsonObject) {
        version(value, "event.version"); id(value["eventId"], "event.eventId"); counter(value["sequence"], "event.sequence")
        member(value["kind"], events, "event.kind"); member(value["source"], sources, "event.source"); timestamp(value["observedAtMs"], "event.observedAtMs")
    }
    private fun lookup(value: JsonObject) {
        version(value, "lookup.version"); id(value["operationId"], "lookup.operationId"); id(value["accountGeneration"], "lookup.generation")
        member(value["status"], lookups, "lookup.status"); if (value.string("status") == "available") result(value.objectValue("result")) else require(value["result"] == null, "lookup result")
    }
    private fun session(value: JsonObject) {
        version(value, "session.version"); id(value["sessionId"], "session.id"); id(value["accountGeneration"], "session.generation")
        member(value["status"], sessions, "session.status"); snapshot(value.objectValue("snapshot")); val replay = value.array("replay")
        replay.forEach { event(it.jsonObject) }; if (value.string("status") == "fresh") require(replay.isEmpty(), "fresh replay")
    }
}

private fun require(condition: Boolean, message: String) { if (!condition) throw ContractViolation(message) }
private fun JsonObject.string(key: String) = this[key]?.jsonPrimitive?.contentOrNull ?: throw ContractViolation("$key missing")
private fun JsonObject.int(key: String) = this[key]?.jsonPrimitive?.intOrNull ?: throw ContractViolation("$key missing")
private fun JsonObject.array(key: String) = this[key]?.jsonArray ?: throw ContractViolation("$key missing")
private fun JsonObject.objectValue(key: String) = this[key]?.jsonObject ?: throw ContractViolation("$key missing")
