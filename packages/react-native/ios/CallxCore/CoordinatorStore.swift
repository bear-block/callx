import Foundation

public struct CompletedOperation: Codable, Equatable, Sendable {
    public let command: NativeCommand
    public let result: NativeOperation
    public init(command: NativeCommand, result: NativeOperation) { self.command = command; self.result = result }
}

public struct CoordinatorCheckpoint: Codable, Equatable, Sendable {
    public let schemaVersion: Int
    public let call: CallRecord?
    public let pending: [NativeCommand]
    public let completed: [CompletedOperation]
    public let journal: JournalCheckpoint?
    /// Absent in checkpoints written before the terminal ledger existed.
    public let terminal: [TerminalRecord]?
    public init(schemaVersion: Int = 1, call: CallRecord?, pending: [NativeCommand], completed: [CompletedOperation],
        journal: JournalCheckpoint? = nil, terminal: [TerminalRecord]? = nil) {
        self.schemaVersion = schemaVersion; self.call = call; self.pending = pending; self.completed = completed
        self.journal = journal; self.terminal = terminal
    }
}

public protocol CoordinatorStore: Sendable {
    func save(_ checkpoint: CoordinatorCheckpoint) throws
    func load() throws -> CoordinatorCheckpoint?
}

public struct CoordinatorFileStore: CoordinatorStore, Sendable {
    private let url: URL
    public init(url: URL) { self.url = url }

    public func save(_ checkpoint: CoordinatorCheckpoint) throws {
        let data = try JSONEncoder().encode(checkpoint)
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try data.write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }

    public func load() throws -> CoordinatorCheckpoint? {
        guard FileManager.default.fileExists(atPath: url.path) else { return nil }
        let checkpoint = try JSONDecoder().decode(CoordinatorCheckpoint.self, from: Data(contentsOf: url))
        guard checkpoint.schemaVersion == 1 else { throw StoreError.unsupportedSchema(checkpoint.schemaVersion) }
        return checkpoint
    }

    public enum StoreError: Error, Equatable { case unsupportedSchema(Int) }
}
