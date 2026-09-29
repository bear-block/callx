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
    public var ringDeadlineAtMs: Int64?
    /// Media connected once and has since dropped; the call itself is unaffected.
    public var mediaInterrupted: Bool {
        get { mediaInterruptedFlag ?? false }
        set { mediaInterruptedFlag = newValue ? true : nil }
    }
    // Optional so checkpoints written before this field existed still decode.
    private var mediaInterruptedFlag: Bool?
    public init(callID: String, state: CallState, muted: Bool = false, mediaReady: Bool = false,
        endReason: String? = nil, displayName: String? = nil, handle: String? = nil,
        direction: CallDirection? = nil, createdAtMs: Int64? = nil, acceptedAtMs: Int64? = nil,
        mediaConnectedAtMs: Int64? = nil, endedAtMs: Int64? = nil, ringDeadlineAtMs: Int64? = nil,
        mediaInterrupted: Bool = false) {
        self.callID = callID; self.state = state; self.muted = muted
        self.mediaReady = mediaReady; self.endReason = endReason; self.displayName = displayName
        self.handle = handle; self.direction = direction; self.createdAtMs = createdAtMs
        self.acceptedAtMs = acceptedAtMs; self.mediaConnectedAtMs = mediaConnectedAtMs; self.endedAtMs = endedAtMs
        self.ringDeadlineAtMs = ringDeadlineAtMs; self.mediaInterrupted = mediaInterrupted
    }
}

/// A call that ended; its ID is never used again while the record is retained.
public struct TerminalRecord: Codable, Equatable, Sendable {
    public let callID: String
    public let reason: String
    public let endedAtMs: Int64
    public init(callID: String, reason: String, endedAtMs: Int64) {
        self.callID = callID; self.reason = reason; self.endedAtMs = endedAtMs
    }
}

/// Why an incoming invitation did or did not create a call.
public enum IncomingOutcome: Equatable, Sendable {
    case accepted
    /// The same call is already live.
    case duplicate
    /// The call already ended; the platform must not ring for it again.
    case ended(reason: String)
    /// Another call is live.
    case busy
    /// The invitation expired before it arrived.
    case expired
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
    public static let terminalRetentionMs: Int64 = 86_400_000
    public static let terminalQuota = 1_000
    private struct Pending: Sendable { let command: NativeCommand }
    private var call: CallRecord?
    private var terminal: [TerminalRecord] = []
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
        terminal = checkpoint.terminal ?? []
    }
    public init(store: any CoordinatorStore) throws {
        self.store = store
        if let checkpoint = try store.load() {
            call = checkpoint.call
            pending = Dictionary(uniqueKeysWithValues: checkpoint.pending.map { ($0.operationID, Pending(command: $0)) })
            completed = Dictionary(uniqueKeysWithValues: checkpoint.completed.map { ($0.command.operationID, ($0.command, $0.result)) })
            journal = EventJournal(checkpoint: checkpoint.journal ?? JournalCheckpoint())
            terminal = checkpoint.terminal ?? []
        }
    }
    private func restore(_ checkpoint: CoordinatorCheckpoint) {
        call = checkpoint.call
        lastCompletedPruneAt = nil
        pending.removeAll(); completed.removeAll()
        pending = Dictionary(uniqueKeysWithValues: checkpoint.pending.map { ($0.operationID, Pending(command: $0)) })
        completed = Dictionary(uniqueKeysWithValues: checkpoint.completed.map { ($0.command.operationID, ($0.command, $0.result)) })
        journal = EventJournal(checkpoint: checkpoint.journal ?? JournalCheckpoint())
        terminal = checkpoint.terminal ?? []
    }
    public func snapshot() -> CallRecord? { call }
    public func operation(_ id: String) -> NativeOperation? {
        completed[id]?.1 ?? (pending[id].map { _ in NativeOperation(operationID: id, status: .pending, errorCode: nil) })
    }
    public func pendingCommands() -> [NativeCommand] { pending.values.map(\.command) }
    public func checkpoint() -> CoordinatorCheckpoint {
        CoordinatorCheckpoint(call: call, pending: pending.values.map(\.command),
            completed: completed.values.map { CompletedOperation(command: $0.0, result: $0.1) }, journal: journal.state,
            terminal: terminal)
    }
    public func replayEvents(after sequence: UInt64) -> ReplayOutcome { journal.replay(after: sequence) }
    public func acknowledgeEvents(through sequence: UInt64) throws { try journal.acknowledge(through: sequence) }
    public func observationCapture(after sequence: UInt64? = nil) -> ObservationCapture {
        ObservationCapture(call: call, watermark: journal.state.nextSequence - 1,
            replay: sequence.map { journal.replay(after: $0) })
    }

    public func terminalRecord(callID: String, nowMs: Int64) -> TerminalRecord? {
        terminal.last { $0.callID == callID && nowMs - $0.endedAtMs < Self.terminalRetentionMs }
    }

    @discardableResult
    public func reportIncoming(callID: String, displayName: String? = nil, handle: String? = nil, nowMs: Int64 = 0,
        ringDeadlineAtMs: Int64? = nil, expiresAtMs: Int64? = nil) -> IncomingOutcome {
        expireRinging(nowMs: nowMs)
        if let record = terminalRecord(callID: callID, nowMs: nowMs) { return .ended(reason: record.reason) }
        if let current = call, current.callID == callID {
            return current.state == .ended ? .ended(reason: current.endReason ?? "failed") : .duplicate
        }
        if let expiresAtMs, expiresAtMs <= nowMs { return .expired }
        if let current = call, current.state != .ended { return .busy }
        let deadline = [ringDeadlineAtMs, expiresAtMs].compactMap { $0 }.min()
        call = CallRecord(callID: callID, state: .incoming, displayName: displayName, handle: handle,
            direction: .incoming, createdAtMs: nowMs, ringDeadlineAtMs: deadline)
        journal.append(kind: "callChanged", observedAtMs: nowMs, callID: callID, source: .platform)
        return .accepted
    }

    /// An answer the OS performed itself; the platform action is already complete.
    @discardableResult public func platformAnswered(callID: String, nowMs: Int64) -> Bool {
        guard var current = call, current.callID == callID, current.state == .incoming else { return false }
        current.state = .connecting; current.acceptedAtMs = nowMs; current.ringDeadlineAtMs = nil; call = current
        journal.append(kind: "callChanged", observedAtMs: nowMs, callID: callID, source: .platform)
        return true
    }

    /// A hangup or decline the OS performed itself. Without a reason, incoming calls are declined.
    @discardableResult public func platformEnded(callID: String, reason: String? = nil, nowMs: Int64) -> Bool {
        guard let current = call, current.callID == callID, current.state != .ended else { return false }
        let resolved = reason ?? (current.state == .incoming ? "declined" : "localHangup")
        return end(callID: callID, reason: resolved, source: .platform, nowMs: nowMs)
    }

    /// A mute change the OS made itself, for example from a car or headset. True when state changed.
    @discardableResult public func platformMuted(callID: String, muted: Bool, nowMs: Int64) -> Bool {
        guard var current = call, current.callID == callID, current.muted != muted,
              current.state != .incoming, current.state != .ended else { return false }
        current.muted = muted; call = current
        journal.append(kind: "callChanged", observedAtMs: nowMs, callID: callID, source: .platform)
        return true
    }

    /// A hold or resume the OS made itself, for example for call waiting. True when state changed.
    @discardableResult public func platformHeld(callID: String, held: Bool, nowMs: Int64) -> Bool {
        guard var current = call, current.callID == callID else { return false }
        switch (held, current.state) {
        case (true, .active): current.state = .held
        case (false, .held): current.state = .active
        default: return false
        }
        call = current
        journal.append(kind: "callChanged", observedAtMs: nowMs, callID: callID, source: .platform)
        return true
    }

    /// Ends an incoming call whose ring deadline passed; returns its ID.
    @discardableResult public func expireRinging(nowMs: Int64, callID: String? = nil) -> String? {
        guard let current = call, callID == nil || current.callID == callID,
            current.state == .incoming, let deadline = current.ringDeadlineAtMs,
              deadline <= nowMs else { return nil }
        end(callID: current.callID, reason: "unanswered", source: .local, nowMs: nowMs)
        return current.callID
    }

    @discardableResult public func remoteAnswered(callID: String, nowMs: Int64) -> Bool {
        guard var current = call, current.callID == callID, current.state == .outgoing else { return false }
        current.state = .connecting; current.acceptedAtMs = nowMs; call = current
        journal.append(kind: "callChanged", observedAtMs: nowMs, callID: callID, source: .signaling)
        return true
    }

    public func mediaConnected(callID: String, nowMs: Int64) {
        guard var current = call, current.callID == callID else { return }
        if current.mediaInterrupted {
            // Media came back after an interruption; the first connection time stays.
            current.mediaInterrupted = false
        } else if current.state == .connecting || current.state == .held {
            if current.state != .held { current.state = .active }
            current.mediaReady = true; current.mediaConnectedAtMs = nowMs
        } else { return }
        call = current
        journal.append(kind: "callChanged", observedAtMs: nowMs, callID: callID, source: .media)
    }

    /// Media that had connected dropped, for example while the media SDK reconnects. Only an
    /// observation: it never ends or holds the call. True when state changed.
    @discardableResult public func mediaInterrupted(callID: String, nowMs: Int64) -> Bool {
        guard var current = call, current.callID == callID, !current.mediaInterrupted, current.mediaReady,
              current.state == .active || current.state == .held else { return false }
        current.mediaInterrupted = true; call = current
        journal.append(kind: "callChanged", observedAtMs: nowMs, callID: callID, source: .media)
        return true
    }

    /// Ends the live call, or records a tombstone so a later invitation for this ID cannot ring.
    @discardableResult
    public func remoteEnded(callID: String, reason: String = "remoteEnded", nowMs: Int64 = 0) -> Bool {
        if end(callID: callID, reason: reason, source: .signaling, nowMs: nowMs) { return true }
        if call?.callID != callID, terminalRecord(callID: callID, nowMs: nowMs) == nil {
            recordTerminal(callID: callID, reason: reason, nowMs: nowMs)
        }
        return false
    }

    @discardableResult
    private func end(callID: String, reason: String, source: EventSource, nowMs: Int64) -> Bool {
        guard var current = call, current.callID == callID, current.state != .ended else { return false }
        current.state = .ended; current.mediaReady = false; current.mediaInterrupted = false; current.endReason = reason
        current.endedAtMs = nowMs; current.ringDeadlineAtMs = nil; call = current
        recordTerminal(callID: callID, reason: reason, nowMs: nowMs)
        journal.append(kind: "callChanged", observedAtMs: nowMs, callID: callID, source: source)
        let affected = pending.filter { $0.value.command.callID == callID }
        for (id, item) in affected {
            completed[id] = (item.command, NativeOperation(operationID: id, status: .rejected,
                errorCode: "invalidState", completedAtMs: nowMs))
            pending.removeValue(forKey: id)
            journal.append(kind: "operationCompleted", observedAtMs: nowMs, operationID: id, source: source)
        }
        pruneCompleted(nowMs: nowMs)
        return true
    }

    private func recordTerminal(callID: String, reason: String, nowMs: Int64) {
        terminal.removeAll { $0.callID == callID || nowMs - $0.endedAtMs >= Self.terminalRetentionMs }
        terminal.append(TerminalRecord(callID: callID, reason: reason, endedAtMs: nowMs))
        if terminal.count > Self.terminalQuota { terminal.removeFirst(terminal.count - Self.terminalQuota) }
    }

    public func prepare(_ command: NativeCommand, nowMs: Int64) -> Preparation {
        expireRinging(nowMs: nowMs)
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
        if let error = preconditionError(command, nowMs: nowMs) {
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

    private func preconditionError(_ command: NativeCommand, nowMs: Int64) -> String? {
        if command.type == .startCall {
            guard command.displayName?.isEmpty == false, command.handle?.isEmpty == false else { return "invalidArgument" }
            // A call ID identifies one session and is never reused.
            if call?.callID == command.callID || terminalRecord(callID: command.callID, nowMs: nowMs) != nil {
                return "invalidState"
            }
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
        case .answer: current.state = .connecting; current.acceptedAtMs = nowMs; current.ringDeadlineAtMs = nil
        case .end:
            let reason = current.state == .incoming ? "declined" : "localHangup"
            recordTerminal(callID: current.callID, reason: reason, nowMs: nowMs)
            current.state = .ended; current.mediaReady = false; current.mediaInterrupted = false
            current.endReason = reason
            current.endedAtMs = nowMs; current.ringDeadlineAtMs = nil
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

    /// Cold-process recovery: media/platform sessions cannot be inferred from a checkpoint.
    /// Call before accepting new work, never when only a framework engine reattaches.
    /// Return even an already-ended record so platform cleanup can be retried after a crash.
    public func durableRecoverAfterProcessDeath(nowMs: Int64) throws -> CallRecord? {
        guard let current = call else { return nil }
        if current.state == .ended { return current }
        let before = checkpoint()
        let expired = current.state == .incoming && current.ringDeadlineAtMs.map { $0 <= nowMs } == true
        _ = end(callID: current.callID, reason: expired ? "unanswered" : "failed", source: .recovery, nowMs: nowMs)
        try persist(orRestore: before)
        return call
    }

    public func durablePrepare(_ command: NativeCommand, nowMs: Int64) throws -> Preparation {
        let before = checkpoint(); let result = prepare(command, nowMs: nowMs)
        try persist(orRestore: before); return result
    }
    @discardableResult
    public func durableReportIncoming(callID: String, displayName: String? = nil, handle: String? = nil,
        nowMs: Int64, ringDeadlineAtMs: Int64? = nil, expiresAtMs: Int64? = nil) throws -> IncomingOutcome {
        let before = checkpoint()
        let outcome = reportIncoming(callID: callID, displayName: displayName, handle: handle, nowMs: nowMs,
            ringDeadlineAtMs: ringDeadlineAtMs, expiresAtMs: expiresAtMs)
        try persist(orRestore: before); return outcome
    }
    @discardableResult public func durablePlatformAnswered(callID: String, nowMs: Int64) throws -> Bool {
        let before = checkpoint(); let result = platformAnswered(callID: callID, nowMs: nowMs)
        try persist(orRestore: before); return result
    }
    @discardableResult public func durablePlatformEnded(callID: String, reason: String? = nil, nowMs: Int64) throws -> Bool {
        let before = checkpoint(); let result = platformEnded(callID: callID, reason: reason, nowMs: nowMs)
        try persist(orRestore: before); return result
    }
    @discardableResult public func durablePlatformMuted(callID: String, muted: Bool, nowMs: Int64) throws -> Bool {
        let before = checkpoint(); let result = platformMuted(callID: callID, muted: muted, nowMs: nowMs)
        try persist(orRestore: before); return result
    }
    @discardableResult public func durablePlatformHeld(callID: String, held: Bool, nowMs: Int64) throws -> Bool {
        let before = checkpoint(); let result = platformHeld(callID: callID, held: held, nowMs: nowMs)
        try persist(orRestore: before); return result
    }
    @discardableResult public func durableExpireRinging(nowMs: Int64, callID: String? = nil) throws -> String? {
        let before = checkpoint(); let result = expireRinging(nowMs: nowMs, callID: callID)
        try persist(orRestore: before); return result
    }
    @discardableResult public func durableRemoteAnswered(callID: String, nowMs: Int64) throws -> Bool {
        let before = checkpoint(); let result = remoteAnswered(callID: callID, nowMs: nowMs)
        try persist(orRestore: before); return result
    }
    public func durableMediaConnected(callID: String, nowMs: Int64) throws {
        let before = checkpoint(); mediaConnected(callID: callID, nowMs: nowMs); try persist(orRestore: before)
    }
    @discardableResult public func durableMediaInterrupted(callID: String, nowMs: Int64) throws -> Bool {
        let before = checkpoint(); let result = mediaInterrupted(callID: callID, nowMs: nowMs)
        try persist(orRestore: before); return result
    }
    @discardableResult
    public func durableRemoteEnded(callID: String, reason: String = "remoteEnded", nowMs: Int64) throws -> Bool {
        let before = checkpoint(); let result = remoteEnded(callID: callID, reason: reason, nowMs: nowMs)
        try persist(orRestore: before); return result
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
