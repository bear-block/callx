import Foundation

public enum CallState: String, Codable, Sendable { case incoming, outgoing, connecting, active, held, ended }
public enum CallDirection: String, Codable, Sendable { case incoming, outgoing }
public enum CommandType: String, Codable, Sendable { case startCall, answer, end, setMuted, setHeld }
public enum OperationStatus: String, Codable, Sendable { case pending, applied, rejected, timedOut, unknown }

public struct CallRecord: Codable, Equatable, Sendable {
    public let callID: String
    public var state: CallState
    public var muted: Bool
    public var mediaReady: Bool
    public var endReason: String?
    public var displayName: String?
    public var handle: String?
    public var direction: CallDirection?
    public var createdAtMs: Int64?
    public var acceptedAtMs: Int64?
    public var mediaConnectedAtMs: Int64?
    public var endedAtMs: Int64?
    public init(callID: String, state: CallState, muted: Bool = false, mediaReady: Bool = false,
        endReason: String? = nil, displayName: String? = nil, handle: String? = nil,
        direction: CallDirection? = nil, createdAtMs: Int64? = nil, acceptedAtMs: Int64? = nil,
        mediaConnectedAtMs: Int64? = nil, endedAtMs: Int64? = nil) {
        self.callID = callID; self.state = state; self.muted = muted
        self.mediaReady = mediaReady; self.endReason = endReason; self.displayName = displayName
        self.handle = handle; self.direction = direction; self.createdAtMs = createdAtMs
        self.acceptedAtMs = acceptedAtMs; self.mediaConnectedAtMs = mediaConnectedAtMs; self.endedAtMs = endedAtMs
    }
}

public struct NativeCommand: Codable, Equatable, Sendable {
    public let operationID: String
    public let type: CommandType
    public let callID: String
    public let value: Bool?
    public let displayName: String?
    public let handle: String?
    public let deadlineAtMs: Int64
    public init(operationID: String, type: CommandType, callID: String, value: Bool? = nil,
        displayName: String? = nil, handle: String? = nil, deadlineAtMs: Int64) {
        self.operationID = operationID; self.type = type; self.callID = callID
        self.value = value; self.displayName = displayName; self.handle = handle; self.deadlineAtMs = deadlineAtMs
    }
}

public struct NativeOperation: Codable, Equatable, Sendable {
    public let operationID: String
    public let status: OperationStatus
    public let errorCode: String?
    public let completedAtMs: Int64?
    public init(operationID: String, status: OperationStatus, errorCode: String?, completedAtMs: Int64? = nil) {
        self.operationID = operationID; self.status = status; self.errorCode = errorCode; self.completedAtMs = completedAtMs
    }
}

public enum Preparation: Equatable, Sendable {
    case execute
    case existing(NativeOperation)
    case conflict(NativeOperation)
}
public struct ObservationCapture: Sendable {
    public let call: CallRecord?
    public let watermark: UInt64
    public let replay: ReplayOutcome?
}

/// Platform-neutral serialized coordinator. CallKit adapters execute only `.execute` commands
/// and call `completeApplied`; no optimistic state mutation occurs during `prepare`.
public actor CallCoordinator {
    public static let operationRetentionMs: Int64 = 86_400_000
    public static let operationQuota = 10_000
    private struct Pending: Sendable { let command: NativeCommand }
    private var call: CallRecord?
    private var pending: [String: Pending] = [:]
    private var completed: [String: (NativeCommand, NativeOperation)] = [:]
    private var lastCompletedPruneAt: Int64?
    private var journal = EventJournal()
    private let store: (any CoordinatorStore)?

    public init() { store = nil }
    public init(checkpoint: CoordinatorCheckpoint) {
        store = nil
        call = checkpoint.call
        pending = Dictionary(uniqueKeysWithValues: checkpoint.pending.map { ($0.operationID, Pending(command: $0)) })
        completed = Dictionary(uniqueKeysWithValues: checkpoint.completed.map { ($0.command.operationID, ($0.command, $0.result)) })
        journal = EventJournal(checkpoint: checkpoint.journal ?? JournalCheckpoint())
    }
    public init(store: any CoordinatorStore) throws {
        self.store = store
        if let checkpoint = try store.load() {
            call = checkpoint.call
            pending = Dictionary(uniqueKeysWithValues: checkpoint.pending.map { ($0.operationID, Pending(command: $0)) })
            completed = Dictionary(uniqueKeysWithValues: checkpoint.completed.map { ($0.command.operationID, ($0.command, $0.result)) })
            journal = EventJournal(checkpoint: checkpoint.journal ?? JournalCheckpoint())
        }
    }
    private func restore(_ checkpoint: CoordinatorCheckpoint) {
        call = checkpoint.call
        lastCompletedPruneAt = nil
        pending.removeAll(); completed.removeAll()
        pending = Dictionary(uniqueKeysWithValues: checkpoint.pending.map { ($0.operationID, Pending(command: $0)) })
        completed = Dictionary(uniqueKeysWithValues: checkpoint.completed.map { ($0.command.operationID, ($0.command, $0.result)) })
        journal = EventJournal(checkpoint: checkpoint.journal ?? JournalCheckpoint())
    }
    public func snapshot() -> CallRecord? { call }
    public func operation(_ id: String) -> NativeOperation? {
        completed[id]?.1 ?? (pending[id].map { _ in NativeOperation(operationID: id, status: .pending, errorCode: nil) })
    }
    public func pendingCommands() -> [NativeCommand] { pending.values.map(\.command) }
    public func checkpoint() -> CoordinatorCheckpoint {
        CoordinatorCheckpoint(call: call, pending: pending.values.map(\.command),
            completed: completed.values.map { CompletedOperation(command: $0.0, result: $0.1) }, journal: journal.state)
    }
    public func replayEvents(after sequence: UInt64) -> ReplayOutcome { journal.replay(after: sequence) }
    public func acknowledgeEvents(through sequence: UInt64) throws { try journal.acknowledge(through: sequence) }
    public func observationCapture(after sequence: UInt64? = nil) -> ObservationCapture {
        ObservationCapture(call: call, watermark: journal.state.nextSequence - 1,
            replay: sequence.map { journal.replay(after: $0) })
    }

    public func reportIncoming(callID: String, displayName: String? = nil, handle: String? = nil, nowMs: Int64 = 0) {
        guard call == nil || call?.state == .ended else { return }
        call = CallRecord(callID: callID, state: .incoming, displayName: displayName, handle: handle,
            direction: .incoming, createdAtMs: nowMs)
        journal.append(kind: "callChanged", observedAtMs: nowMs, callID: callID, source: .platform)
    }

    public func remoteAnswered(callID: String, nowMs: Int64) {
        guard var current = call, current.callID == callID, current.state == .outgoing else { return }
        current.state = .connecting; current.acceptedAtMs = nowMs; call = current
        journal.append(kind: "callChanged", observedAtMs: nowMs, callID: callID, source: .signaling)
    }

    public func mediaConnected(callID: String, nowMs: Int64) {
        guard var current = call, current.callID == callID,
              current.state == .connecting || current.state == .held else { return }
        if current.state != .held { current.state = .active }
        current.mediaReady = true; current.mediaConnectedAtMs = nowMs; call = current
        journal.append(kind: "callChanged", observedAtMs: nowMs, callID: callID, source: .media)
    }

    public func remoteEnded(callID: String, reason: String = "remoteEnded", nowMs: Int64 = 0) {
        guard var current = call, current.callID == callID, current.state != .ended else { return }
        current.state = .ended; current.mediaReady = false; current.endReason = reason
        current.endedAtMs = nowMs; call = current
        journal.append(kind: "callChanged", observedAtMs: nowMs, callID: callID, source: .signaling)
        let affected = pending.filter { $0.value.command.callID == callID }
        for (id, item) in affected {
            completed[id] = (item.command, NativeOperation(operationID: id, status: .rejected,
                errorCode: "invalidState", completedAtMs: nowMs))
            pending.removeValue(forKey: id)
            journal.append(kind: "operationCompleted", observedAtMs: nowMs, operationID: id, source: .signaling)
        }
        pruneCompleted(nowMs: nowMs)
    }

    public func prepare(_ command: NativeCommand, nowMs: Int64) -> Preparation {
        if let old = completed[command.operationID] {
            return old.0 == command ? .existing(old.1) : .conflict(conflict(command.operationID, nowMs: nowMs))
        }
        if let old = pending[command.operationID] {
            return old.command == command
                ? .existing(NativeOperation(operationID: command.operationID, status: .pending, errorCode: nil))
                : .conflict(conflict(command.operationID, nowMs: nowMs))
        }
        guard command.deadlineAtMs > nowMs else {
            let result = NativeOperation(operationID: command.operationID, status: .timedOut,
                errorCode: "deadlineExceeded", completedAtMs: nowMs)
            completed[command.operationID] = (command, result)
            pruneCompleted(nowMs: nowMs)
            journal.append(kind: "operationCompleted", observedAtMs: nowMs, operationID: command.operationID)
            return .existing(result)
        }
        if let error = preconditionError(command) {
            let result = NativeOperation(operationID: command.operationID, status: .rejected,
                errorCode: error, completedAtMs: nowMs)
            completed[command.operationID] = (command, result)
            pruneCompleted(nowMs: nowMs)
            journal.append(kind: "operationCompleted", observedAtMs: nowMs, operationID: command.operationID)
            return .existing(result)
        }
        pending[command.operationID] = Pending(command: command)
        return .execute
    }

    public func expire(nowMs: Int64) {
        for (id, item) in pending where item.command.deadlineAtMs <= nowMs {
            completed[id] = (item.command, NativeOperation(operationID: id, status: .timedOut,
                errorCode: "deadlineExceeded", completedAtMs: nowMs))
            pending.removeValue(forKey: id)
            journal.append(kind: "operationCompleted", observedAtMs: nowMs, operationID: id, source: .recovery)
        }
        pruneCompleted(nowMs: nowMs)
    }

    @discardableResult public func completeApplied(operationID: String, nowMs: Int64) -> NativeOperation? {
        guard let item = pending.removeValue(forKey: operationID) else { return completed[operationID]?.1 }
        guard item.command.deadlineAtMs > nowMs else {
            let result = NativeOperation(operationID: operationID, status: .timedOut,
                errorCode: "deadlineExceeded", completedAtMs: nowMs)
            completed[operationID] = (item.command, result)
            pruneCompleted(nowMs: nowMs)
            journal.append(kind: "operationCompleted", observedAtMs: nowMs, operationID: operationID)
            return result
        }
        apply(item.command, nowMs: nowMs)
        let result = NativeOperation(operationID: operationID, status: .applied, errorCode: nil, completedAtMs: nowMs)
        completed[operationID] = (item.command, result)
        pruneCompleted(nowMs: nowMs)
        journal.append(kind: "callChanged", observedAtMs: nowMs, callID: item.command.callID)
        journal.append(kind: "operationCompleted", observedAtMs: nowMs, operationID: operationID)
        return result
    }
    @discardableResult public func completeRejected(operationID: String, errorCode: String,
        nowMs: Int64) -> NativeOperation? {
        guard let item = pending.removeValue(forKey: operationID) else { return completed[operationID]?.1 }
        let result = NativeOperation(operationID: operationID, status: .rejected,
            errorCode: errorCode, completedAtMs: nowMs)
        completed[operationID] = (item.command, result)
        pruneCompleted(nowMs: nowMs)
        journal.append(kind: "operationCompleted", observedAtMs: nowMs, operationID: operationID)
        return result
    }
    @discardableResult public func completeUnknown(operationID: String, errorCode: String,
        nowMs: Int64) -> NativeOperation? {
        guard let item = pending.removeValue(forKey: operationID) else { return completed[operationID]?.1 }
        let result = NativeOperation(operationID: operationID, status: .unknown,
            errorCode: errorCode, completedAtMs: nowMs)
        completed[operationID] = (item.command, result)
        pruneCompleted(nowMs: nowMs)
        journal.append(kind: "operationCompleted", observedAtMs: nowMs, operationID: operationID)
        return result
    }
    @discardableResult public func completeTimedOut(operationID: String, nowMs: Int64) -> NativeOperation? {
        guard let item = pending.removeValue(forKey: operationID) else { return completed[operationID]?.1 }
        let result = NativeOperation(operationID: operationID, status: .timedOut,
            errorCode: "deadlineExceeded", completedAtMs: nowMs)
        completed[operationID] = (item.command, result)
        pruneCompleted(nowMs: nowMs)
        journal.append(kind: "operationCompleted", observedAtMs: nowMs, operationID: operationID)
        return result
    }

    private func preconditionError(_ command: NativeCommand) -> String? {
        if command.type == .startCall {
            guard command.displayName?.isEmpty == false, command.handle?.isEmpty == false else { return "invalidArgument" }
            return call == nil || call?.state == .ended ? nil : "busy"
        }
        guard let current = call, current.callID == command.callID else { return "callNotFound" }
        if current.state == .ended { return "invalidState" }
        switch command.type {
        case .answer: return current.state == .incoming ? nil : "invalidState"
        case .end: return nil
        case .setMuted, .setHeld:
            if command.value == nil { return "invalidArgument" }
            return current.state == .active || current.state == .held ? nil : "invalidState"
        case .startCall: return nil
        }
    }

    private func apply(_ command: NativeCommand, nowMs: Int64) {
        if command.type == .startCall {
            call = CallRecord(callID: command.callID, state: .outgoing, displayName: command.displayName,
                handle: command.handle, direction: .outgoing, createdAtMs: nowMs)
            return
        }
        guard var current = call, current.callID == command.callID, current.state != .ended else { return }
        switch command.type {
        case .answer: current.state = .connecting; current.acceptedAtMs = nowMs
        case .end:
            let wasIncoming = current.state == .incoming
            current.state = .ended; current.mediaReady = false
            current.endReason = wasIncoming ? "declined" : "localHangup"
            current.endedAtMs = nowMs
        case .setMuted: current.muted = command.value!
        case .setHeld: current.state = command.value! ? .held : .active
        case .startCall: break
        }
        call = current
    }

    private func conflict(_ id: String, nowMs: Int64) -> NativeOperation {
        NativeOperation(operationID: id, status: .rejected, errorCode: "conflict", completedAtMs: nowMs)
    }
    private func pruneCompleted(nowMs: Int64) {
        if lastCompletedPruneAt == nil || nowMs < lastCompletedPruneAt! ||
            nowMs - lastCompletedPruneAt! >= Self.operationRetentionMs {
            completed = completed.filter { $0.value.1.completedAtMs.map {
                nowMs - $0 < Self.operationRetentionMs
            } ?? false }
            lastCompletedPruneAt = nowMs
        }
        if completed.count > Self.operationQuota {
            let excess = completed.count - Self.operationQuota
            for key in completed.sorted(by: { ($0.value.1.completedAtMs ?? 0) < ($1.value.1.completedAtMs ?? 0) })
                .prefix(excess).map(\.key) { completed.removeValue(forKey: key) }
        }
    }
    private func persist(orRestore before: CoordinatorCheckpoint) throws {
        guard let store else { return }
        do { try store.save(checkpoint()) }
        catch { restore(before); throw error }
    }

    public func durablePrepare(_ command: NativeCommand, nowMs: Int64) throws -> Preparation {
        let before = checkpoint(); let result = prepare(command, nowMs: nowMs)
        try persist(orRestore: before); return result
    }
    public func durableReportIncoming(callID: String, displayName: String? = nil, handle: String? = nil,
        nowMs: Int64) throws {
        let before = checkpoint()
        reportIncoming(callID: callID, displayName: displayName, handle: handle, nowMs: nowMs)
        try persist(orRestore: before)
    }
    public func durableRemoteAnswered(callID: String, nowMs: Int64) throws {
        let before = checkpoint(); remoteAnswered(callID: callID, nowMs: nowMs); try persist(orRestore: before)
    }
    public func durableMediaConnected(callID: String, nowMs: Int64) throws {
        let before = checkpoint(); mediaConnected(callID: callID, nowMs: nowMs); try persist(orRestore: before)
    }
    public func durableRemoteEnded(callID: String, reason: String = "remoteEnded", nowMs: Int64) throws {
        let before = checkpoint(); remoteEnded(callID: callID, reason: reason, nowMs: nowMs); try persist(orRestore: before)
    }
    @discardableResult public func durableCompleteApplied(operationID: String, nowMs: Int64) throws -> NativeOperation? {
        let before = checkpoint(); let result = completeApplied(operationID: operationID, nowMs: nowMs)
        try persist(orRestore: before); return result
    }
    @discardableResult public func durableCompleteRejected(operationID: String, errorCode: String,
        nowMs: Int64) throws -> NativeOperation? {
        let before = checkpoint()
        let result = completeRejected(operationID: operationID, errorCode: errorCode, nowMs: nowMs)
        try persist(orRestore: before); return result
    }
    @discardableResult public func durableCompleteUnknown(operationID: String, errorCode: String,
        nowMs: Int64) throws -> NativeOperation? {
        let before = checkpoint()
        let result = completeUnknown(operationID: operationID, errorCode: errorCode, nowMs: nowMs)
        try persist(orRestore: before); return result
    }
    @discardableResult public func durableCompleteTimedOut(operationID: String, nowMs: Int64) throws -> NativeOperation? {
        let before = checkpoint(); let result = completeTimedOut(operationID: operationID, nowMs: nowMs)
        try persist(orRestore: before); return result
    }
    public func durableExpire(nowMs: Int64) throws {
        let before = checkpoint(); expire(nowMs: nowMs); try persist(orRestore: before)
    }
    public func durableAcknowledgeEvents(through sequence: UInt64) throws {
        let before = checkpoint(); try acknowledgeEvents(through: sequence); try persist(orRestore: before)
    }
}
