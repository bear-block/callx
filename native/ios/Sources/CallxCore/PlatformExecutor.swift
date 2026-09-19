public enum PlatformOutcome: Equatable, Sendable {
    case applied(completedAtMs: Int64)
    case rejected(errorCode: String, completedAtMs: Int64)
}

public protocol PlatformCommandExecutor: Sendable {
    func perform(_ command: NativeCommand) async -> PlatformOutcome
}

public actor CommandDispatcher {
    private let coordinator: CallCoordinator
    private let executor: any PlatformCommandExecutor
    public init(coordinator: CallCoordinator, executor: any PlatformCommandExecutor) {
        self.coordinator = coordinator; self.executor = executor
    }
    public func execute(_ command: NativeCommand, nowMs: Int64) async throws -> NativeOperation {
        switch try await coordinator.durablePrepare(command, nowMs: nowMs) {
        case .existing(let result), .conflict(let result): return result
        case .execute: break
        }
        switch await executor.perform(command) {
        case .applied(let completedAtMs):
            return try await coordinator.durableCompleteApplied(operationID: command.operationID,
                nowMs: completedAtMs) ?? NativeOperation(operationID: command.operationID, status: .unknown,
                    errorCode: "internal")
        case .rejected(let code, let completedAtMs):
            return try await coordinator.durableCompleteRejected(operationID: command.operationID,
                errorCode: code, nowMs: completedAtMs) ?? NativeOperation(operationID: command.operationID,
                    status: .unknown, errorCode: "internal")
        }
    }
}
