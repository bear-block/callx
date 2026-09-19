import Foundation

public enum CallState: String, Codable, Sendable { case incoming, outgoing, connecting, active, held, ended }
public enum CommandType: String, Codable, Sendable { case startCall, answer, end, setMuted, setHeld }
public enum OperationStatus: String, Codable, Sendable { case pending, applied, rejected, timedOut, unknown }

public struct CallRecord: Codable, Equatable, Sendable {
    public let callID: String
    public var state: CallState
    public var muted: Bool
    public var mediaReady: Bool
    public var endReason: String?
    public init(callID: String, state: CallState, muted: Bool = false, mediaReady: Bool = false, endReason: String? = nil) {
        self.callID = callID; self.state = state; self.muted = muted
        self.mediaReady = mediaReady; self.endReason = endReason
    }
}

public struct NativeCommand: Codable, Equatable, Sendable {
    public let operationID: String
    public let type: CommandType
    public let callID: String
    public let value: Bool?
    public let deadlineAtMs: Int64
    public init(operationID: String, type: CommandType, callID: String, value: Bool? = nil, deadlineAtMs: Int64) {
        self.operationID = operationID; self.type = type; self.callID = callID
        self.value = value; self.deadlineAtMs = deadlineAtMs
    }
}

public struct NativeOperation: Codable, Equatable, Sendable {
    public let operationID: String
    public let status: OperationStatus
    public let errorCode: String?
}

public enum Preparation: Equatable, Sendable {
    case execute
    case existing(NativeOperation)
    case conflict(NativeOperation)
}

/// Platform-neutral serialized coordinator. CallKit adapters execute only `.execute` commands
/// and call `completeApplied`; no optimistic state mutation occurs during `prepare`.
public actor CallCoordinator {
    private struct Pending: Sendable { let command: NativeCommand }
    private var call: CallRecord?
    private var pending: [String: Pending] = [:]
    private var completed: [String: (NativeCommand, NativeOperation)] = [:]
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

    public func reportIncoming(callID: String, nowMs: Int64 = 0) {
        guard call == nil || call?.state == .ended else { return }
        call = CallRecord(callID: callID, state: .incoming)
        journal.append(kind: "callChanged", observedAtMs: nowMs, callID: callID)
    }

    public func remoteEnded(callID: String, reason: String = "remoteEnded", nowMs: Int64 = 0) {
        guard var current = call, current.callID == callID, current.state != .ended else { return }
        current.state = .ended; current.mediaReady = false; current.endReason = reason; call = current
        journal.append(kind: "callChanged", observedAtMs: nowMs, callID: callID)
        let affected = pending.filter { $0.value.command.callID == callID }
        for (id, item) in affected {
            completed[id] = (item.command, NativeOperation(operationID: id, status: .rejected, errorCode: "invalidState"))
            pending.removeValue(forKey: id)
            journal.append(kind: "operationCompleted", observedAtMs: nowMs, operationID: id)
        }
    }

    public func prepare(_ command: NativeCommand, nowMs: Int64) -> Preparation {
        if let old = completed[command.operationID] {
            return old.0 == command ? .existing(old.1) : .conflict(conflict(command.operationID))
        }
        if let old = pending[command.operationID] {
            return old.command == command
                ? .existing(NativeOperation(operationID: command.operationID, status: .pending, errorCode: nil))
                : .conflict(conflict(command.operationID))
        }
        guard command.deadlineAtMs > nowMs else {
            let result = NativeOperation(operationID: command.operationID, status: .timedOut, errorCode: "deadlineExceeded")
            completed[command.operationID] = (command, result)
            journal.append(kind: "operationCompleted", observedAtMs: nowMs, operationID: command.operationID)
            return .existing(result)
        }
        if let error = preconditionError(command) {
            let result = NativeOperation(operationID: command.operationID, status: .rejected, errorCode: error)
            completed[command.operationID] = (command, result)
            journal.append(kind: "operationCompleted", observedAtMs: nowMs, operationID: command.operationID)
            return .existing(result)
        }
        pending[command.operationID] = Pending(command: command)
        return .execute
    }

    public func expire(nowMs: Int64) {
        for (id, item) in pending where item.command.deadlineAtMs <= nowMs {
            completed[id] = (item.command, NativeOperation(operationID: id, status: .timedOut, errorCode: "deadlineExceeded"))
            pending.removeValue(forKey: id)
            journal.append(kind: "operationCompleted", observedAtMs: nowMs, operationID: id)
        }
    }

    @discardableResult public func completeApplied(operationID: String, nowMs: Int64) -> NativeOperation? {
        guard let item = pending.removeValue(forKey: operationID) else { return completed[operationID]?.1 }
        guard item.command.deadlineAtMs > nowMs else {
            let result = NativeOperation(operationID: operationID, status: .timedOut, errorCode: "deadlineExceeded")
            completed[operationID] = (item.command, result)
            journal.append(kind: "operationCompleted", observedAtMs: nowMs, operationID: operationID)
            return result
        }
        apply(item.command)
        let result = NativeOperation(operationID: operationID, status: .applied, errorCode: nil)
        completed[operationID] = (item.command, result)
        journal.append(kind: "callChanged", observedAtMs: nowMs, callID: item.command.callID)
        journal.append(kind: "operationCompleted", observedAtMs: nowMs, operationID: operationID)
        return result
    }
    @discardableResult public func completeRejected(operationID: String, errorCode: String,
        nowMs: Int64) -> NativeOperation? {
        guard let item = pending.removeValue(forKey: operationID) else { return completed[operationID]?.1 }
        let result = NativeOperation(operationID: operationID, status: .rejected, errorCode: errorCode)
        completed[operationID] = (item.command, result)
        journal.append(kind: "operationCompleted", observedAtMs: nowMs, operationID: operationID)
        return result
    }
    @discardableResult public func completeUnknown(operationID: String, errorCode: String,
        nowMs: Int64) -> NativeOperation? {
        guard let item = pending.removeValue(forKey: operationID) else { return completed[operationID]?.1 }
        let result = NativeOperation(operationID: operationID, status: .unknown, errorCode: errorCode)
        completed[operationID] = (item.command, result)
        journal.append(kind: "operationCompleted", observedAtMs: nowMs, operationID: operationID)
        return result
    }

    private func preconditionError(_ command: NativeCommand) -> String? {
        guard let current = call, current.callID == command.callID else { return "callNotFound" }
        if current.state == .ended { return "invalidState" }
        switch command.type {
        case .answer: return current.state == .incoming ? nil : "invalidState"
        case .end: return nil
        case .setMuted, .setHeld:
            if command.value == nil { return "invalidArgument" }
            return current.state == .active || current.state == .held ? nil : "invalidState"
        case .startCall: return "unsupported"
        }
    }

    private func apply(_ command: NativeCommand) {
        guard var current = call, current.callID == command.callID, current.state != .ended else { return }
        switch command.type {
        case .answer: current.state = .connecting
        case .end:
            let wasIncoming = current.state == .incoming
            current.state = .ended; current.mediaReady = false
            current.endReason = wasIncoming ? "declined" : "localHangup"
        case .setMuted: current.muted = command.value!
        case .setHeld: current.state = command.value! ? .held : .active
        case .startCall: break
        }
        call = current
    }

    private func conflict(_ id: String) -> NativeOperation {
        NativeOperation(operationID: id, status: .rejected, errorCode: "conflict")
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
    public func durableReportIncoming(callID: String, nowMs: Int64) throws {
        let before = checkpoint(); reportIncoming(callID: callID, nowMs: nowMs); try persist(orRestore: before)
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
    public func durableExpire(nowMs: Int64) throws {
        let before = checkpoint(); expire(nowMs: nowMs); try persist(orRestore: before)
    }
    public func durableAcknowledgeEvents(through sequence: UInt64) throws {
        let before = checkpoint(); try acknowledgeEvents(through: sequence); try persist(orRestore: before)
    }
}
