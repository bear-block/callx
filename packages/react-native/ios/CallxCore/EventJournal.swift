import Foundation

public struct JournalEvent: Codable, Equatable, Sendable {
    public let eventID: String
    public let sequence: UInt64
    public let kind: String
    public let observedAtMs: Int64
    public let callID: String?
    public let operationID: String?
}

public struct JournalCheckpoint: Codable, Equatable, Sendable {
    public var nextSequence: UInt64
    public var acknowledged: UInt64
    public var events: [JournalEvent]
    public init(nextSequence: UInt64 = 1, acknowledged: UInt64 = 0, events: [JournalEvent] = []) {
        self.nextSequence = nextSequence; self.acknowledged = acknowledged; self.events = events
    }
}

public enum ReplayOutcome: Equatable, Sendable { case replay([JournalEvent]); case gap }

public struct EventJournal: Sendable {
    public static let retentionMs: Int64 = 86_400_000
    public static let eventQuota = 2_048
    public static let encodedByteQuota = 2_097_152
    private(set) public var state: JournalCheckpoint
    public init(checkpoint: JournalCheckpoint = JournalCheckpoint()) { state = checkpoint }

    @discardableResult public mutating func append(kind: String, observedAtMs: Int64,
        callID: String? = nil, operationID: String? = nil) -> JournalEvent {
        let sequence = state.nextSequence; state.nextSequence += 1
        let event = JournalEvent(eventID: "event-\(sequence)", sequence: sequence, kind: kind,
            observedAtMs: observedAtMs, callID: callID, operationID: operationID)
        state.events.append(event); prune(nowMs: observedAtMs); return event
    }
    public mutating func acknowledge(through sequence: UInt64) throws {
        guard sequence >= state.acknowledged, sequence < state.nextSequence else { throw JournalError.invalidAcknowledgement }
        state.acknowledged = sequence
    }
    public func replay(after sequence: UInt64) -> ReplayOutcome {
        let last = state.nextSequence - 1
        guard sequence <= last else { return .gap }
        if let first = state.events.first?.sequence, sequence + 1 < first { return .gap }
        return .replay(state.events.filter { $0.sequence > sequence })
    }
    public mutating func prune(nowMs: Int64) {
        while let first = state.events.first,
              nowMs - first.observedAtMs >= Self.retentionMs { state.events.removeFirst() }
        while state.events.count > Self.eventQuota { state.events.removeFirst() }
        let encoder = JSONEncoder()
        while state.events.count > 1,
              (try? encoder.encode(state.events).count) ?? (Self.encodedByteQuota + 1) > Self.encodedByteQuota {
            state.events.removeFirst()
        }
    }
    public enum JournalError: Error { case invalidAcknowledgement }
}
