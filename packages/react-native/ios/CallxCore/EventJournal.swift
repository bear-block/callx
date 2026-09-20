import Foundation

public enum EventSource: String, Codable, Sendable { case local, platform, signaling, media, recovery }

public struct JournalEvent: Codable, Equatable, Sendable {
    public let eventID: String
    public let sequence: UInt64
    public let kind: String
    public let source: EventSource
    public let observedAtMs: Int64
    public let callID: String?
    public let operationID: String?
    public init(eventID: String, sequence: UInt64, kind: String, source: EventSource,
        observedAtMs: Int64, callID: String? = nil, operationID: String? = nil) {
        self.eventID = eventID; self.sequence = sequence; self.kind = kind; self.source = source
        self.observedAtMs = observedAtMs; self.callID = callID; self.operationID = operationID
    }
    private enum CodingKeys: String, CodingKey {
        case eventID, sequence, kind, source, observedAtMs, callID, operationID
    }
    public init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        eventID = try values.decode(String.self, forKey: .eventID)
        sequence = try values.decode(UInt64.self, forKey: .sequence)
        kind = try values.decode(String.self, forKey: .kind)
        source = try values.decodeIfPresent(EventSource.self, forKey: .source) ?? .recovery
        observedAtMs = try values.decode(Int64.self, forKey: .observedAtMs)
        callID = try values.decodeIfPresent(String.self, forKey: .callID)
        operationID = try values.decodeIfPresent(String.self, forKey: .operationID)
    }
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
    private static let envelopeBytes = 128
    private(set) public var state: JournalCheckpoint
    private var encodedEventBytes: Int
    public init(checkpoint: JournalCheckpoint = JournalCheckpoint()) {
        state = checkpoint; encodedEventBytes = checkpoint.events.reduce(0) { $0 + Self.encodedBytes($1) }
    }

    @discardableResult public mutating func append(kind: String, observedAtMs: Int64,
        callID: String? = nil, operationID: String? = nil, source: EventSource = .local) -> JournalEvent {
        let sequence = state.nextSequence; state.nextSequence += 1
        let event = JournalEvent(eventID: "event-\(sequence)", sequence: sequence, kind: kind, source: source,
            observedAtMs: observedAtMs, callID: callID, operationID: operationID)
        state.events.append(event); encodedEventBytes += Self.encodedBytes(event)
        prune(nowMs: observedAtMs); return event
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
              nowMs - first.observedAtMs >= Self.retentionMs { removeFirst() }
        while state.events.count > Self.eventQuota { removeFirst() }
        while state.events.count > 1,
              encodedEventBytes + state.events.count + Self.envelopeBytes > Self.encodedByteQuota {
            removeFirst()
        }
    }
    private static func encodedBytes(_ event: JournalEvent) -> Int {
        (try? JSONEncoder().encode(event).count) ?? (encodedByteQuota + 1)
    }
    private mutating func removeFirst() { encodedEventBytes -= Self.encodedBytes(state.events.removeFirst()) }
    public enum JournalError: Error { case invalidAcknowledgement }
}
