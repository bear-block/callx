import Foundation

public enum BridgeValue: Equatable, Sendable {
    case string(String), bool(Bool), integer(Int64), object([String: BridgeValue]), array([BridgeValue]), null
}
public typealias BridgeObject = [String: BridgeValue]

public struct BridgeError: Error, Equatable, Sendable {
    public let code: String
    public let message: String
    public init(_ code: String, _ message: String) { self.code = code; self.message = message }
}

public struct BridgeCapabilities: Sendable {
    public let accountGeneration: String
    public let durableReplay: Bool
    public let providerManagedSignaling: Bool
    public let hold: Bool
    public let mute: Bool
    /// The media adapter supports video (ADR-0010).
    public let video: Bool
    public init(accountGeneration: String, durableReplay: Bool, providerManagedSignaling: Bool,
        hold: Bool, mute: Bool, video: Bool = false) {
        self.accountGeneration = accountGeneration; self.durableReplay = durableReplay
        self.providerManagedSignaling = providerManagedSignaling; self.hold = hold; self.mute = mute
        self.video = video
    }
}

public protocol BridgeEventReceiving: AnyObject, Sendable {
    func receive(_ event: BridgeObject)
}

/** Framework-neutral actor. Flutter and React Native only translate BridgeValue at their boundary. */
public actor BridgeRuntime {
    private static let version = "0.2.0"
    /// 0.2 only adds optional fields and commands, so 0.1 wrappers keep working.
    private static let supportedVersions: Set<String> = ["0.1.0", "0.2.0"]
    private static let endReasons = ["localHangup", "declined", "remoteEnded", "callerCancelled", "unanswered", "busy",
        "failed", "answeredElsewhere", "declinedElsewhere"]
    private static let identifier = try! NSRegularExpression(pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")
    private let coordinator: CallCoordinator
    private let dispatcher: CommandDispatcher
    private let capabilities: BridgeCapabilities
    private let nowMs: @Sendable () -> Int64
    private var sessionCounter: UInt64 = 0
    private var nativeOperationCounter: UInt64 = 0
    private var activeSession: String?
    private var emittedThrough: UInt64 = 0
    private weak var eventReceiver: (any BridgeEventReceiving)?
    private var callObservers: [UUID: @Sendable (CallRecord?, UInt64) -> Void] = [:]

    public init(coordinator: CallCoordinator, executor: any PlatformCommandExecutor,
        capabilities: BridgeCapabilities, nowMs: @escaping @Sendable () -> Int64) {
        self.coordinator = coordinator; dispatcher = CommandDispatcher(coordinator: coordinator, executor: executor)
        self.capabilities = capabilities; self.nowMs = nowMs
    }

    public func setup(_ value: BridgeObject) throws -> BridgeObject {
        try requireVersion(value)
        _ = try requiredID(["accountGeneration": .string(capabilities.accountGeneration)], "accountGeneration")
        return [
        "contractVersion": .string(Self.version), "coreVersion": .string(Self.version),
        "execution": .string("native"), "accountGeneration": .string(capabilities.accountGeneration),
        "nativeCalling": .bool(true), "durableReplay": .bool(capabilities.durableReplay),
        "providerManagedSignaling": .bool(capabilities.providerManagedSignaling),
        "hold": .bool(capabilities.hold), "mute": .bool(capabilities.mute), "video": .bool(capabilities.video),
        ]
    }

    public func execute(_ value: BridgeObject) async throws -> BridgeObject {
        let receivedAt = nowMs()
        let operation = try await dispatcher.execute(decodeCommand(value, receivedAt: receivedAt), nowMs: receivedAt)
        let result = try operationMap(operation)
        await publishNewEvents()
        return result
    }

    public func queryOperation(_ value: BridgeObject) async throws -> BridgeObject {
        try requireVersion(value)
        let operationID = try requiredID(value, "operationId")
        let generation = try requiredID(value, "accountGeneration")
        let base: BridgeObject = ["contractVersion": .string(Self.version), "operationId": .string(operationID),
            "accountGeneration": .string(generation)]
        guard generation == capabilities.accountGeneration else { return base.merging(["status": .string("generationMismatch")]) { $1 } }
        guard let operation = await coordinator.operation(operationID), operation.completedAtMs != nil else {
            return base.merging(["status": .string("unavailable")]) { $1 }
        }
        return try base.merging(["status": .string("available"), "result": .object(operationMap(operation))]) { $1 }
    }

    public func openSession(_ value: BridgeObject) async throws -> BridgeObject {
        try requireVersion(value)
        let after: UInt64?
        if let raw = value["afterSequence"] {
            guard case .string(let text) = raw, let parsed = UInt64(text) else { throw invalid("afterSequence is invalid.") }
            after = parsed
        } else { after = nil }
        sessionCounter += 1; let sessionID = "session-\(sessionCounter)"; activeSession = sessionID
        let capture = await coordinator.observationCapture(after: after)
        let status: String; let replay: [JournalEvent]
        if after != nil {
            switch capture.replay! {
            case .gap: status = "resynced"; replay = []
            case .replay(let events): status = "resumed"; replay = events
            }
        } else { status = "fresh"; replay = [] }
        let watermark = capture.watermark; emittedThrough = watermark
        return ["contractVersion": .string(Self.version), "sessionId": .string(sessionID),
            "accountGeneration": .string(capabilities.accountGeneration), "status": .string(status),
            "snapshot": .object(try snapshotMap(watermark: watermark, call: visibleCall(capture.call))),
            "replay": .array(replay.map { .object(eventMap($0)) })]
    }

    public func acknowledge(_ value: BridgeObject) async throws {
        try requireSession(value)
        guard case .string(let text) = value["throughSequence"], let sequence = UInt64(text) else {
            throw invalid("throughSequence is invalid.")
        }
        do { try await coordinator.durableAcknowledgeEvents(through: sequence) }
        catch { throw BridgeError("invalidArgument", "Invalid acknowledgement.") }
    }
    public func closeSession(_ value: BridgeObject) throws { try requireSession(value); activeSession = nil }
    public func getSnapshot() async throws -> BridgeObject {
        let capture = await coordinator.observationCapture()
        var result: BridgeObject = ["contractVersion": .string(Self.version),
            "sequence": .string(String(capture.watermark))]
        result["call"] = if let call = visibleCall(capture.call) { .object(try callMap(call)) } else { .null }
        return result
    }
    /// Native lifecycle view, including ended calls; not subject to UI retention filtering.
    public func currentCall() async -> CallRecord? { await coordinator.snapshot() }

    /// Invoke during cold-process bootstrap, before installing the runtime or starting push ingress.
    public func recoverAfterProcessDeath() async throws -> CallRecord? {
        let call = try await coordinator.durableRecoverAfterProcessDeath(nowMs: nowMs())
        await publishNewEvents()
        return call
    }

    /// Records an invitation. Only `.accepted` means the platform should ring.
    @discardableResult
    public func reportIncoming(callID: String, displayName: String, handle: String,
        observedAtMs: Int64? = nil, ringDeadlineAtMs: Int64? = nil, expiresAtMs: Int64? = nil,
        video: Bool = false) async throws -> IncomingOutcome {
        _ = try requiredID(["callId": .string(callID)], "callId")
        _ = try requiredText(["displayName": .string(displayName)], "displayName", maxBytes: 256)
        _ = try requiredText(["handle": .string(handle)], "handle", maxBytes: 256)
        let outcome = try await coordinator.durableReportIncoming(callID: callID, displayName: displayName,
            handle: handle, nowMs: observedAtMs ?? nowMs(), ringDeadlineAtMs: ringDeadlineAtMs, expiresAtMs: expiresAtMs,
            video: video)
        await publishNewEvents(); return outcome
    }
    /// Returns true when an outgoing call moved to connecting.
    @discardableResult
    public func remoteAnswered(callID: String, observedAtMs: Int64? = nil) async throws -> Bool {
        _ = try requiredID(["callId": .string(callID)], "callId")
        let result = try await coordinator.durableRemoteAnswered(callID: callID, nowMs: observedAtMs ?? nowMs())
        await publishNewEvents(); return result
    }
    public func mediaConnected(callID: String, observedAtMs: Int64? = nil) async throws {
        _ = try requiredID(["callId": .string(callID)], "callId")
        try await coordinator.durableMediaConnected(callID: callID, nowMs: observedAtMs ?? nowMs())
        await publishNewEvents()
    }
    /// Media that had connected dropped; call ``mediaConnected(callID:observedAtMs:)`` when it is
    /// back. It never ends or holds the call: end it through signaling if media does not return.
    @discardableResult
    public func mediaInterrupted(callID: String, observedAtMs: Int64? = nil) async throws -> Bool {
        _ = try requiredID(["callId": .string(callID)], "callId")
        let changed = try await coordinator.durableMediaInterrupted(callID: callID, nowMs: observedAtMs ?? nowMs())
        await publishNewEvents(); return changed
    }
    /// Video the media adapter observed: the camera taken by the OS or given back, and whether a
    /// remote video track is available. Pass nil for what did not change. True when state changed.
    @discardableResult
    public func videoObserved(callID: String, localVideo: LocalVideo? = nil, remoteVideo: Bool? = nil,
        observedAtMs: Int64? = nil) async throws -> Bool {
        _ = try requiredID(["callId": .string(callID)], "callId")
        let changed = try await coordinator.durableVideoObserved(callID: callID, localVideo: localVideo,
            remoteVideo: remoteVideo, nowMs: observedAtMs ?? nowMs())
        await publishNewEvents(); return changed
    }
    /// Returns true when a live call ended; otherwise the ID is recorded so it cannot ring later.
    @discardableResult
    public func remoteEnded(callID: String, reason: String = "remoteEnded", observedAtMs: Int64? = nil) async throws -> Bool {
        _ = try requiredID(["callId": .string(callID)], "callId")
        guard Self.endReasons.contains(reason) else { throw invalid("reason is unsupported.") }
        let ended = try await coordinator.durableRemoteEnded(callID: callID, reason: reason, nowMs: observedAtMs ?? nowMs())
        await publishNewEvents(); return ended
    }
    /// Records an answer the OS already performed; does not request a platform action.
    @discardableResult
    public func platformAnswered(callID: String, observedAtMs: Int64? = nil) async throws -> Bool {
        _ = try requiredID(["callId": .string(callID)], "callId")
        let result = try await coordinator.durablePlatformAnswered(callID: callID, nowMs: observedAtMs ?? nowMs())
        await publishNewEvents(); return result
    }
    /// Records a hangup or decline the OS already performed; does not request a platform action.
    @discardableResult
    public func platformEnded(callID: String, reason: String? = nil, observedAtMs: Int64? = nil) async throws -> Bool {
        _ = try requiredID(["callId": .string(callID)], "callId")
        if let reason, !Self.endReasons.contains(reason) { throw invalid("reason is unsupported.") }
        let result = try await coordinator.durablePlatformEnded(callID: callID, reason: reason,
            nowMs: observedAtMs ?? nowMs())
        await publishNewEvents(); return result
    }
    /// Records a mute change the OS already made; apply it to media only when this returns true.
    @discardableResult
    public func platformMuted(callID: String, muted: Bool, observedAtMs: Int64? = nil) async throws -> Bool {
        _ = try requiredID(["callId": .string(callID)], "callId")
        let result = try await coordinator.durablePlatformMuted(callID: callID, muted: muted, nowMs: observedAtMs ?? nowMs())
        await publishNewEvents(); return result
    }
    /// Records a hold or resume the OS already made; does not request a platform action.
    @discardableResult
    public func platformHeld(callID: String, held: Bool, observedAtMs: Int64? = nil) async throws -> Bool {
        _ = try requiredID(["callId": .string(callID)], "callId")
        let result = try await coordinator.durablePlatformHeld(callID: callID, held: held, nowMs: observedAtMs ?? nowMs())
        await publishNewEvents(); return result
    }
    /// Ends a ringing call whose deadline passed and returns its ID so the platform call can end too.
    @discardableResult
    public func expireRinging(observedAtMs: Int64? = nil, callID: String? = nil) async throws -> String? {
        let result = try await coordinator.durableExpireRinging(nowMs: observedAtMs ?? nowMs(), callID: callID)
        await publishNewEvents(); return result
    }
    /// Runs a call-control command that started in native UI, such as a notification button.
    public func executeNative(_ type: CommandType, callID: String, value: Bool? = nil) async throws -> NativeOperation {
        guard type != .startCall else { throw invalid("startCall needs input.") }
        _ = try requiredID(["callId": .string(callID)], "callId")
        let receivedAt = nowMs(); nativeOperationCounter += 1
        let command = NativeCommand(operationID: "native-\(receivedAt)-\(nativeOperationCounter)", type: type,
            callID: callID, value: value, deadlineAtMs: receivedAt + 4_000)
        let operation = try await dispatcher.execute(command, nowMs: receivedAt)
        await publishNewEvents(); return operation
    }
    public func setEventReceiver(_ receiver: (any BridgeEventReceiving)?) { eventReceiver = receiver }

    /// Native presentation observes independently of the framework's replay session.
    /// Closing a Dart/JS session must not leave a PiP controller attached to an ended call.
    /// The watermark lets asynchronous UI delivery discard older snapshots.
    public func addCallObserver(_ observer: @escaping @Sendable (CallRecord?, UInt64) -> Void) async -> UUID {
        let id = UUID()
        callObservers[id] = observer
        let capture = await coordinator.observationCapture()
        observer(capture.call, capture.watermark)
        return id
    }
    public func removeCallObserver(_ id: UUID) { callObservers.removeValue(forKey: id) }

    public func publishNewEvents() async {
        if !callObservers.isEmpty {
            let capture = await coordinator.observationCapture()
            for observer in callObservers.values { observer(capture.call, capture.watermark) }
        }
        guard let session = activeSession, let receiver = eventReceiver else { return }
        guard case .replay(let events) = await coordinator.replayEvents(after: emittedThrough) else { return }
        for event in events {
            emittedThrough = event.sequence
            receiver.receive(eventMap(event).merging(["sessionId": .string(session)]) { $1 })
        }
    }

    private func decodeCommand(_ value: BridgeObject, receivedAt: Int64) throws -> NativeCommand {
        try requireVersion(value)
        let operationID = try requiredID(value, "operationId")
        guard case .string(let typeText) = value["type"], let type = CommandType(rawValue: typeText) else {
            throw invalid("type is unsupported.")
        }
        let deadline: Int64
        if let raw = value["deadlineAtMs"] {
            guard case .integer(let number) = raw, number >= 0, number <= 9_007_199_254_740_991 else {
                throw invalid("deadlineAtMs is invalid.")
            }; deadline = number
        } else { deadline = receivedAt + (type == .startCall ? 10_000 : 4_000) }
        // Only the upper bound is enforced: a retry must still reach its stored result after
        // the deadline passes, and an expired deadline already completes as timedOut.
        guard deadline - receivedAt <= 30_000 else { throw invalid("deadlineAtMs is more than 30 seconds ahead.") }
        if type == .startCall {
            guard value["callId"] == nil, value["value"] == nil else { throw invalid("startCall contains forbidden fields.") }
            guard case .object(let input) = value["input"] else { throw invalid("input is required.") }
            var video = false
            if let raw = input["video"] {
                guard case .bool(let flag) = raw else { throw invalid("input.video must be boolean.") }; video = flag
            }
            return NativeCommand(operationID: operationID, type: type, callID: try requiredID(input, "callId"),
                displayName: try requiredText(input, "displayName", maxBytes: 256),
                handle: try requiredText(input, "handle", maxBytes: 256), deadlineAtMs: deadline, video: video)
        }
        guard value["input"] == nil else { throw invalid("input is only valid for startCall.") }
        if type == .switchCamera {
            guard case .string(let name) = value["value"], let facing = CameraFacing(rawValue: name) else {
                throw invalid("value must be front or back.")
            }
            return NativeCommand(operationID: operationID, type: type, callID: try requiredID(value, "callId"),
                deadlineAtMs: deadline, facing: facing)
        }
        let bool: Bool?
        if type == .setMuted || type == .setHeld || type == .setCamera {
            guard case .bool(let value) = value["value"] else { throw invalid("value is required.") }; bool = value
        } else {
            guard value["value"] == nil else { throw invalid("value is forbidden for this command.") }; bool = nil
        }
        return NativeCommand(operationID: operationID, type: type, callID: try requiredID(value, "callId"),
            value: bool, deadlineAtMs: deadline)
    }

    private func operationMap(_ value: NativeOperation) throws -> BridgeObject {
        guard let completedAt = value.completedAtMs else { throw BridgeError("internal", "Operation is not terminal.") }
        var result: BridgeObject = ["contractVersion": .string(Self.version), "operationId": .string(value.operationID),
            "status": .string(value.status.rawValue), "execution": .string("native"), "completedAtMs": .integer(completedAt)]
        if let code = value.errorCode { result["error"] = .object(["code": .string(code),
            "message": .string(errorMessage(code)), "retryable": .bool(code == "nativeUnavailable")]) }
        return result
    }
    private func snapshotMap(watermark: UInt64, call: CallRecord?) throws -> BridgeObject {
        let calls: [BridgeValue]
        if let call { calls = [.object(try callMap(call))] } else { calls = [] }
        return ["contractVersion": .string(Self.version), "watermark": .string(String(watermark)), "calls": .array(calls)]
    }
    private func visibleCall(_ value: CallRecord?) -> CallRecord? {
        guard let value, value.state == .ended, let ended = value.endedAtMs,
              nowMs() - ended >= 300_000 else { return value }
        return nil
    }
    private func callMap(_ value: CallRecord) throws -> BridgeObject {
        guard let direction = value.direction, let displayName = value.displayName else {
            throw BridgeError("internal", "Call identity is incomplete.")
        }
        var result: BridgeObject = ["callId": .string(value.callID), "displayName": .string(displayName),
            "direction": .string(direction.rawValue), "state": .string(value.state.rawValue),
            "muted": .bool(value.muted), "mediaReady": .bool(value.mediaReady),
            "mediaInterrupted": .bool(value.mediaInterrupted)]
        if let item = value.endReason { result["endReason"] = .string(item) }
        if let item = value.createdAtMs { result["createdAtMs"] = .integer(item) }
        if let item = value.acceptedAtMs { result["acceptedAtMs"] = .integer(item) }
        if let item = value.mediaConnectedAtMs { result["mediaConnectedAtMs"] = .integer(item) }
        if let item = value.endedAtMs { result["endedAtMs"] = .integer(item) }
        // Video fields are omitted at their defaults, so 0.1 snapshots stay unchanged.
        if value.video { result["video"] = .bool(true) }
        if value.localVideo != .off {
            result["localVideo"] = .string(value.localVideo.rawValue)
            result["cameraFacing"] = .string((value.cameraFacing ?? .front).rawValue)
        }
        if value.remoteVideo { result["remoteVideo"] = .bool(true) }
        return result
    }
    private func eventMap(_ value: JournalEvent) -> BridgeObject {
        var result: BridgeObject = ["contractVersion": .string(Self.version), "eventId": .string(value.eventID),
            "sequence": .string(String(value.sequence)), "kind": .string(value.kind),
            "source": .string(value.source.rawValue), "observedAtMs": .integer(value.observedAtMs)]
        if let item = value.callID { result["callId"] = .string(item) }
        if let item = value.operationID { result["operationId"] = .string(item) }
        return result
    }
    private func requireVersion(_ value: BridgeObject) throws {
        guard case .string(let version) = value["contractVersion"], Self.supportedVersions.contains(version) else {
            throw invalid("Incompatible contractVersion.")
        }
    }
    private func requireSession(_ value: BridgeObject) throws {
        guard let activeSession, value["sessionId"] == .string(activeSession) else { throw invalid("Observation session is stale.") }
    }
    private func requiredID(_ value: BridgeObject, _ key: String) throws -> String {
        let text = try requiredText(value, key, maxBytes: 128)
        let range = NSRange(text.startIndex..<text.endIndex, in: text)
        guard Self.identifier.firstMatch(in: text, range: range)?.range == range else { throw invalid("\(key) is invalid.") }
        return text
    }
    private func requiredText(_ value: BridgeObject, _ key: String, maxBytes: Int) throws -> String {
        guard case .string(let text) = value[key], !text.isEmpty, text.utf8.count <= maxBytes else {
            throw invalid("\(key) is invalid.")
        }; return text
    }
    private func errorMessage(_ code: String) -> String {
        switch code {
        case "deadlineExceeded": "The native operation exceeded its deadline."
        case "conflict": "operationId was already used with different arguments."
        default: "Native operation failed: \(code)."
        }
    }
    private func invalid(_ message: String) -> BridgeError { BridgeError("invalidArgument", message) }
}
