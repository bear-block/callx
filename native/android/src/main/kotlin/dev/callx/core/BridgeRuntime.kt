package dev.callx.core

import java.util.concurrent.CompletionStage

class BridgeViolation(val code: String, message: String) : IllegalArgumentException(message)

data class BridgeCapabilities(
    val accountGeneration: String,
    val durableReplay: Boolean,
    val providerManagedSignaling: Boolean,
    val hold: Boolean,
    val mute: Boolean,
    /** The media adapter supports video (ADR-0010). */
    val video: Boolean = false,
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
    private var nativeOperationCounter = 0L
    private var activeSession: String? = null
    private var emittedThrough = coordinator.checkpoint().journal?.nextSequence?.minus(1) ?: 0
    private var eventListener: ((Map<String, Any?>) -> Unit)? = null
    private val callObservers = java.util.concurrent.CopyOnWriteArrayList<(CallRecord?) -> Unit>()
    private var observedCall: CallRecord? = null

    fun setup(value: Map<String, Any?>): Map<String, Any?> {
        requireVersion(value)
        requiredId(mapOf("accountGeneration" to capabilities.accountGeneration), "accountGeneration")
        return mapOf(
        "contractVersion" to VERSION, "coreVersion" to VERSION, "execution" to "native",
        "accountGeneration" to capabilities.accountGeneration, "nativeCalling" to true,
        "durableReplay" to capabilities.durableReplay,
        "providerManagedSignaling" to capabilities.providerManagedSignaling,
        "hold" to capabilities.hold, "mute" to capabilities.mute, "video" to capabilities.video,
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

    /** Native lifecycle view including ended calls, without UI retention filtering. */
    fun currentCall(): CallRecord? = coordinator.snapshot()

    /** Invoke during cold-process bootstrap, before installing the runtime or accepting pushes. */
    fun recoverAfterProcessDeath(): CallRecord? =
        coordinator.durableRecoverAfterProcessDeath(nowMs()).also { publishNewEvents() }

    /** Records an invitation. Only [IncomingOutcome.Accepted] means the platform should ring. */
    fun reportIncoming(callId: String, displayName: String, handle: String, observedAtMs: Long = nowMs(),
        ringDeadlineAtMs: Long? = null, expiresAtMs: Long? = null, video: Boolean = false): IncomingOutcome {
        requiredId(mapOf("callId" to callId), "callId"); requiredText(mapOf("displayName" to displayName), "displayName", 256)
        requiredText(mapOf("handle" to handle), "handle", 256)
        return coordinator.durableReportIncoming(callId, observedAtMs, displayName, handle, ringDeadlineAtMs, expiresAtMs, video)
            .also { publishNewEvents() }
    }
    /** Returns true when an outgoing call moved to connecting. */
    fun remoteAnswered(callId: String, observedAtMs: Long = nowMs()): Boolean {
        requiredId(mapOf("callId" to callId), "callId")
        return coordinator.durableRemoteAnswered(callId, observedAtMs).also { publishNewEvents() }
    }
    fun mediaConnected(callId: String, observedAtMs: Long = nowMs()) {
        requiredId(mapOf("callId" to callId), "callId")
        coordinator.durableMediaConnected(callId, observedAtMs); publishNewEvents()
    }
    /**
     * Media that had connected dropped; call [mediaConnected] when it is back. It never ends or holds
     * the call: end it through signaling if media does not return. Returns true when state changed.
     */
    fun mediaInterrupted(callId: String, observedAtMs: Long = nowMs()): Boolean {
        requiredId(mapOf("callId" to callId), "callId")
        return coordinator.durableMediaInterrupted(callId, observedAtMs).also { publishNewEvents() }
    }
    /**
     * Video the media adapter observed: the camera taken by the OS or given back, and whether a
     * remote video track is available. Pass null for what did not change. True when state changed.
     */
    fun videoObserved(callId: String, localVideo: LocalVideo? = null, remoteVideo: Boolean? = null,
        observedAtMs: Long = nowMs()): Boolean {
        requiredId(mapOf("callId" to callId), "callId")
        return coordinator.durableVideoObserved(callId, localVideo, remoteVideo, observedAtMs).also { publishNewEvents() }
    }
    /** Returns true when a live call ended; otherwise the ID is recorded so it cannot ring later. */
    fun remoteEnded(callId: String, reason: String = "remoteEnded", observedAtMs: Long = nowMs()): Boolean {
        requiredId(mapOf("callId" to callId), "callId")
        if (reason !in END_REASONS) invalid("reason is unsupported.")
        return coordinator.durableRemoteEnded(callId, reason, observedAtMs).also { publishNewEvents() }
    }
    /** Records an answer the OS already performed; does not request a platform action. */
    fun platformAnswered(callId: String, observedAtMs: Long = nowMs()): Boolean {
        requiredId(mapOf("callId" to callId), "callId")
        return coordinator.durablePlatformAnswered(callId, observedAtMs).also { publishNewEvents() }
    }
    /** Records a hangup or decline the OS already performed; does not request a platform action. */
    fun platformEnded(callId: String, reason: String? = null, observedAtMs: Long = nowMs()): Boolean {
        requiredId(mapOf("callId" to callId), "callId")
        if (reason != null && reason !in END_REASONS) invalid("reason is unsupported.")
        return coordinator.durablePlatformEnded(callId, reason, observedAtMs).also { publishNewEvents() }
    }
    /** Records a mute change the OS already made; apply it to media only when this returns true. */
    fun platformMuted(callId: String, muted: Boolean, observedAtMs: Long = nowMs()): Boolean {
        requiredId(mapOf("callId" to callId), "callId")
        return coordinator.durablePlatformMuted(callId, muted, observedAtMs).also { publishNewEvents() }
    }
    /** Records a hold or resume the OS already made; does not request a platform action. */
    fun platformHeld(callId: String, held: Boolean, observedAtMs: Long = nowMs()): Boolean {
        requiredId(mapOf("callId" to callId), "callId")
        return coordinator.durablePlatformHeld(callId, held, observedAtMs).also { publishNewEvents() }
    }
    /** Ends a ringing call whose deadline passed and returns its ID so the platform call can end too. */
    fun expireRinging(observedAtMs: Long = nowMs(), callId: String? = null): String? =
        coordinator.durableExpireRinging(observedAtMs, callId).also { publishNewEvents() }
    /** Runs a call-control command that started in native UI, such as a notification button. */
    fun executeNative(type: CommandType, callId: String, value: Boolean? = null): CompletionStage<NativeOperation> {
        if (type == CommandType.startCall) invalid("startCall needs input.")
        requiredId(mapOf("callId" to callId), "callId")
        val receivedAt = nowMs()
        val operationId = synchronized(this) { "native-$receivedAt-${++nativeOperationCounter}" }
        val command = NativeCommand(operationId, type, callId, value = value, deadlineAtMs = receivedAt + 4_000)
        return dispatcher.execute(command, receivedAt).thenApply { it.also { publishNewEvents() } }
    }

    @Synchronized fun setEventListener(listener: ((Map<String, Any?>) -> Unit)?) { eventListener = listener }

    /**
     * Native observers of the current call, for platform features that follow it (picture-in-picture).
     * Called with the current call at once and after every change, whether or not Dart/JS observes.
     */
    @Synchronized fun addCallObserver(observer: (CallRecord?) -> Unit): () -> Unit {
        callObservers += observer
        observer(coordinator.snapshot())
        return { callObservers -= observer }
    }

    @Synchronized fun publishNewEvents() {
        val call = coordinator.snapshot()
        if (call != observedCall) { observedCall = call; callObservers.forEach { it(call) } }
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
        // Only the upper bound is enforced: a retry must still reach its stored result after
        // the deadline passes, and an expired deadline already completes as timedOut.
        if (deadline - receivedAt > MAX_DEADLINE_LEAD_MS) invalid("deadlineAtMs is more than 30 seconds ahead.")
        if (type == CommandType.startCall) {
            if (value.containsKey("callId") || value.containsKey("value")) invalid("startCall contains forbidden fields.")
            val input = value["input"] as? Map<*, *> ?: invalid("input is required.")
            val callId = requiredId(input, "callId")
            val video = input["video"]?.let { it as? Boolean ?: invalid("input.video must be boolean.") } ?: false
            return NativeCommand(operationId, type, callId,
                displayName = requiredText(input, "displayName", 256),
                handle = requiredText(input, "handle", 256), deadlineAtMs = deadline, video = video)
        }
        if (value.containsKey("input")) invalid("input is only valid for startCall.")
        val callId = requiredId(value, "callId")
        if (type == CommandType.switchCamera) {
            val facing = (value["value"] as? String)?.let { name -> CameraFacing.entries.firstOrNull { it.name == name } }
                ?: invalid("value must be front or back.")
            return NativeCommand(operationId, type, callId, facing = facing, deadlineAtMs = deadline)
        }
        val takesValue = type in setOf(CommandType.setMuted, CommandType.setHeld, CommandType.setCamera)
        val commandValue = if (takesValue) value["value"] as? Boolean ?: invalid("value is required.") else null
        if (!takesValue && value.containsKey("value")) invalid("value is forbidden for this command.")
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
            "mediaInterrupted" to value.mediaInterrupted,
        ).apply {
            value.endReason?.let { put("endReason", it) }; value.createdAtMs?.let { put("createdAtMs", it) }
            value.acceptedAtMs?.let { put("acceptedAtMs", it) }
            value.mediaConnectedAtMs?.let { put("mediaConnectedAtMs", it) }; value.endedAtMs?.let { put("endedAtMs", it) }
            // Video fields are omitted at their defaults, so 0.1 snapshots stay unchanged.
            if (value.video) put("video", true)
            if (value.localVideo != LocalVideo.off) {
                put("localVideo", value.localVideo.name); put("cameraFacing", (value.cameraFacing ?: CameraFacing.front).name)
            }
            if (value.remoteVideo) put("remoteVideo", true)
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
        if (value["contractVersion"] !in SUPPORTED_VERSIONS) throw BridgeViolation("invalidArgument", "Incompatible contractVersion.")
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
        const val VERSION = "0.2.0"
        /** 0.2 only adds optional fields and commands, so 0.1 wrappers keep working. */
        val SUPPORTED_VERSIONS = setOf("0.1.0", "0.2.0")
        const val MAX_TIMESTAMP = 9_007_199_254_740_991L
        const val MAX_DEADLINE_LEAD_MS = 30_000L
        val ID = Regex("^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")
        val END_REASONS = setOf("localHangup", "declined", "remoteEnded", "callerCancelled", "unanswered",
            "busy", "failed", "answeredElsewhere", "declinedElsewhere")
    }
}
