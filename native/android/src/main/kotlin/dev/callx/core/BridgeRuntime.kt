package dev.callx.core

import java.util.concurrent.CompletionStage

class BridgeViolation(val code: String, message: String) : IllegalArgumentException(message)

data class BridgeCapabilities(
    val accountGeneration: String,
    val durableReplay: Boolean,
    val providerManagedSignaling: Boolean,
    val hold: Boolean,
    val mute: Boolean,
)

/** Framework-neutral wire adapter. Flutter and React Native only translate their map types. */
class BridgeRuntime(
    private val coordinator: CallCoordinator,
    executor: PlatformCommandExecutor,
    private val capabilities: BridgeCapabilities,
    private val nowMs: () -> Long = System::currentTimeMillis,
) {
    private val dispatcher = CommandDispatcher(coordinator, executor)
    private var sessionCounter = 0L
    private var activeSession: String? = null
    private var emittedThrough = coordinator.checkpoint().journal?.nextSequence?.minus(1) ?: 0
    private var eventListener: ((Map<String, Any?>) -> Unit)? = null

    fun setup(value: Map<String, Any?>): Map<String, Any?> {
        requireVersion(value); requiredText(value, "appName", 128)
        requiredId(mapOf("accountGeneration" to capabilities.accountGeneration), "accountGeneration")
        return mapOf(
        "contractVersion" to VERSION, "coreVersion" to VERSION, "execution" to "native",
        "accountGeneration" to capabilities.accountGeneration, "nativeCalling" to true,
        "durableReplay" to capabilities.durableReplay,
        "providerManagedSignaling" to capabilities.providerManagedSignaling,
        "hold" to capabilities.hold, "mute" to capabilities.mute,
        )
    }

    fun execute(value: Map<String, Any?>): CompletionStage<Map<String, Any?>> {
        val receivedAt = nowMs()
        val command = decodeCommand(value, receivedAt)
        return dispatcher.execute(command, receivedAt).thenApply { operation ->
            operationMap(operation).also { publishNewEvents() }
        }
    }

    fun queryOperation(value: Map<String, Any?>): Map<String, Any?> {
        requireVersion(value)
        val operationId = requiredId(value, "operationId")
        val generation = requiredId(value, "accountGeneration")
        if (generation != capabilities.accountGeneration) return mapOf(
            "contractVersion" to VERSION, "operationId" to operationId,
            "accountGeneration" to generation, "status" to "generationMismatch",
        )
        val operation = coordinator.operation(operationId)
        return if (operation?.completedAtMs != null) mapOf(
            "contractVersion" to VERSION, "operationId" to operationId,
            "accountGeneration" to generation, "status" to "available",
            "result" to operationMap(operation),
        ) else mapOf(
            "contractVersion" to VERSION, "operationId" to operationId,
            "accountGeneration" to generation, "status" to "unavailable",
        )
    }

    @Synchronized fun openSession(value: Map<String, Any?>): Map<String, Any?> {
        requireVersion(value)
        val afterText = value["afterSequence"] as? String
        val after = afterText?.toLongOrNull()
        if (afterText != null && (after == null || after < 0)) invalid("afterSequence is invalid.")
        val sessionId = "session-${++sessionCounter}"
        activeSession = sessionId
        val replay: List<JournalEvent>
        val status: String
        val capture = coordinator.observationCapture(after)
        if (after == null) { status = "fresh"; replay = emptyList() }
        else when (val outcome = requireNotNull(capture.replay)) {
            ReplayOutcome.Gap -> { status = "resynced"; replay = emptyList() }
            is ReplayOutcome.Replay -> { status = "resumed"; replay = outcome.events }
        }
        val watermark = capture.watermark.toString()
        emittedThrough = watermark.toLong()
        return mapOf(
            "contractVersion" to VERSION, "sessionId" to sessionId,
            "accountGeneration" to capabilities.accountGeneration, "status" to status,
            "snapshot" to snapshotMap(watermark, capture.call), "replay" to replay.map(::eventMap),
        )
    }

    @Synchronized fun acknowledge(value: Map<String, Any?>) {
        requireSession(value)
        val sequence = (value["throughSequence"] as? String)?.toLongOrNull()
            ?: invalid("throughSequence is invalid.")
        try { coordinator.durableAcknowledgeEvents(sequence) }
        catch (error: JournalViolation) { throw BridgeViolation("invalidArgument", error.message ?: "Invalid acknowledgement.") }
    }

    @Synchronized fun closeSession(value: Map<String, Any?>) {
        requireSession(value); activeSession = null
    }

    fun getSnapshot(): Map<String, Any?> {
        val capture = coordinator.observationCapture()
        return mapOf("contractVersion" to VERSION, "sequence" to capture.watermark.toString(),
            "call" to visibleCall(capture.call)?.let(::callMap))
    }

    fun reportIncoming(callId: String, displayName: String, handle: String, observedAtMs: Long = nowMs()) {
        requiredId(mapOf("callId" to callId), "callId"); requiredText(mapOf("displayName" to displayName), "displayName", 256)
        requiredText(mapOf("handle" to handle), "handle", 256)
        coordinator.durableReportIncoming(callId, observedAtMs, displayName, handle); publishNewEvents()
    }
    fun remoteAnswered(callId: String, observedAtMs: Long = nowMs()) {
        requiredId(mapOf("callId" to callId), "callId")
        coordinator.durableRemoteAnswered(callId, observedAtMs); publishNewEvents()
    }
    fun mediaConnected(callId: String, observedAtMs: Long = nowMs()) {
        requiredId(mapOf("callId" to callId), "callId")
        coordinator.durableMediaConnected(callId, observedAtMs); publishNewEvents()
    }
    fun remoteEnded(callId: String, reason: String = "remoteEnded", observedAtMs: Long = nowMs()) {
        requiredId(mapOf("callId" to callId), "callId")
        if (reason !in END_REASONS) invalid("reason is unsupported.")
        coordinator.durableRemoteEnded(callId, reason, observedAtMs); publishNewEvents()
    }

    @Synchronized fun setEventListener(listener: ((Map<String, Any?>) -> Unit)?) { eventListener = listener }

    @Synchronized fun publishNewEvents() {
        val session = activeSession ?: return
        val listener = eventListener ?: return
        when (val outcome = coordinator.replayEvents(emittedThrough)) {
            ReplayOutcome.Gap -> Unit
            is ReplayOutcome.Replay -> outcome.events.forEach {
                emittedThrough = it.sequence; listener(eventMap(it) + ("sessionId" to session))
            }
        }
    }

    private fun decodeCommand(value: Map<String, Any?>, receivedAt: Long): NativeCommand {
        requireVersion(value)
        val operationId = requiredId(value, "operationId")
        val type = try { CommandType.valueOf(value["type"] as? String ?: invalid("type is required.")) }
        catch (_: IllegalArgumentException) { invalid("type is unsupported.") }
        val deadline = (value["deadlineAtMs"] as? Number)?.toLong()
            ?: receivedAt + if (type == CommandType.startCall) 10_000 else 4_000
        if (deadline < 0 || deadline > MAX_TIMESTAMP) invalid("deadlineAtMs is invalid.")
        if (type == CommandType.startCall) {
            if (value.containsKey("callId") || value.containsKey("value")) invalid("startCall contains forbidden fields.")
            val input = value["input"] as? Map<*, *> ?: invalid("input is required.")
            val callId = requiredId(input, "callId")
            return NativeCommand(operationId, type, callId,
                displayName = requiredText(input, "displayName", 256),
                handle = requiredText(input, "handle", 256), deadlineAtMs = deadline)
        }
        if (value.containsKey("input")) invalid("input is only valid for startCall.")
        val callId = requiredId(value, "callId")
        val commandValue = if (type in setOf(CommandType.setMuted, CommandType.setHeld))
            value["value"] as? Boolean ?: invalid("value is required.") else null
        if (type !in setOf(CommandType.setMuted, CommandType.setHeld) && value.containsKey("value"))
            invalid("value is forbidden for this command.")
        return NativeCommand(operationId, type, callId, value = commandValue, deadlineAtMs = deadline)
    }

    private fun operationMap(value: NativeOperation): Map<String, Any?> {
        val completedAt = value.completedAtMs ?: throw BridgeViolation("internal", "Operation is not terminal.")
        val base = mutableMapOf<String, Any?>(
            "contractVersion" to VERSION, "operationId" to value.operationId,
            "status" to value.status.name, "execution" to "native", "completedAtMs" to completedAt,
        )
        value.errorCode?.let { code -> base["error"] = mapOf(
            "code" to code, "message" to errorMessage(code), "retryable" to (code == "nativeUnavailable"),
        ) }
        return base
    }

    private fun snapshotMap(watermark: String, call: CallRecord?): Map<String, Any?> = mapOf(
        "contractVersion" to VERSION, "watermark" to watermark,
        "calls" to visibleCall(call)?.let { listOf(callMap(it)) }.orEmpty(),
    )
    private fun visibleCall(value: CallRecord?): CallRecord? = value?.takeUnless {
        it.state == CallState.ended && it.endedAtMs?.let { ended -> nowMs() - ended >= 300_000 } == true
    }
    private fun callMap(value: CallRecord): Map<String, Any?> {
        val direction = value.direction ?: throw BridgeViolation("internal", "Call direction is missing.")
        val displayName = value.displayName ?: throw BridgeViolation("internal", "Call displayName is missing.")
        return mutableMapOf<String, Any?>(
            "callId" to value.callId, "displayName" to displayName, "direction" to direction.name,
            "state" to value.state.name, "muted" to value.muted, "mediaReady" to value.mediaReady,
        ).apply {
            value.endReason?.let { put("endReason", it) }; value.createdAtMs?.let { put("createdAtMs", it) }
            value.acceptedAtMs?.let { put("acceptedAtMs", it) }
            value.mediaConnectedAtMs?.let { put("mediaConnectedAtMs", it) }; value.endedAtMs?.let { put("endedAtMs", it) }
        }
    }
    private fun eventMap(value: JournalEvent): Map<String, Any?> = mutableMapOf<String, Any?>(
        "contractVersion" to VERSION, "eventId" to value.eventId, "sequence" to value.sequence.toString(),
        "kind" to value.kind, "source" to value.source.name, "observedAtMs" to value.observedAtMs,
    ).apply { value.callId?.let { put("callId", it) }; value.operationId?.let { put("operationId", it) } }

    private fun requireSession(value: Map<String, Any?>) {
        if (value["sessionId"] != activeSession) throw BridgeViolation("invalidArgument", "Observation session is stale.")
    }
    private fun requireVersion(value: Map<String, Any?>) {
        if (value["contractVersion"] != VERSION) throw BridgeViolation("invalidArgument", "Incompatible contractVersion.")
    }
    private fun requiredId(value: Map<*, *>, key: String): String {
        val text = value[key] as? String ?: invalid("$key is required.")
        if (!ID.matches(text) || text.toByteArray().size > 128) invalid("$key is invalid.")
        return text
    }
    private fun requiredText(value: Map<*, *>, key: String, maxBytes: Int): String {
        val text = value[key] as? String ?: invalid("$key is required.")
        if (text.isEmpty() || text.toByteArray().size > maxBytes) invalid("$key is invalid.")
        return text
    }
    private fun errorMessage(code: String) = when (code) {
        "deadlineExceeded" -> "The native operation exceeded its deadline."
        "conflict" -> "operationId was already used with different arguments."
        else -> "Native operation failed: $code."
    }
    private fun invalid(message: String): Nothing = throw BridgeViolation("invalidArgument", message)
    private companion object {
        const val VERSION = "0.1.0"
        const val MAX_TIMESTAMP = 9_007_199_254_740_991L
        val ID = Regex("^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")
        val END_REASONS = setOf("localHangup", "declined", "remoteEnded", "callerCancelled", "unanswered",
            "busy", "failed", "answeredElsewhere", "declinedElsewhere")
    }
}
