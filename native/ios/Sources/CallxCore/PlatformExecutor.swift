public enum PlatformOutcome: Equatable, Sendable {
    case applied(completedAtMs: Int64)
    case rejected(errorCode: String, completedAtMs: Int64)
    case timedOut(completedAtMs: Int64)
    case unknown(errorCode: String, completedAtMs: Int64)
}

public protocol PlatformCommandExecutor: Sendable {
    func perform(_ command: NativeCommand) async -> PlatformOutcome
}

public actor CommandDispatcher {
    private let coordinator: CallCoordinator
    private let executor: any PlatformCommandExecutor
    private var inFlight: [String: (NativeCommand, Task<NativeOperation, any Error>)] = [:]
    public init(coordinator: CallCoordinator, executor: any PlatformCommandExecutor) {
        self.coordinator = coordinator; self.executor = executor
    }
    public func execute(_ command: NativeCommand, nowMs: Int64) async throws -> NativeOperation {
        if let current = inFlight[command.operationID] {
            guard current.0 == command else {
                return NativeOperation(operationID: command.operationID, status: .rejected,
                    errorCode: "conflict", completedAtMs: nowMs)
            }
            return try await current.1.value
        }
        let task = Task { [coordinator, executor] in
            switch try await coordinator.durablePrepare(command, nowMs: nowMs) {
            case .existing(let result), .conflict(let result): return result
            case .execute: break
            }
            let result: NativeOperation
            switch await executor.perform(command) {
            case .applied(let completedAtMs):
                result = try await coordinator.durableCompleteApplied(operationID: command.operationID,
                nowMs: completedAtMs) ?? NativeOperation(operationID: command.operationID, status: .unknown,
                    errorCode: "internal", completedAtMs: completedAtMs)
            case .rejected(let code, let completedAtMs):
                result = try await coordinator.durableCompleteRejected(operationID: command.operationID,
                errorCode: code, nowMs: completedAtMs) ?? NativeOperation(operationID: command.operationID,
                    status: .unknown, errorCode: "internal", completedAtMs: completedAtMs)
            case .timedOut(let completedAtMs):
                result = try await coordinator.durableCompleteTimedOut(operationID: command.operationID,
                    nowMs: completedAtMs) ?? NativeOperation(operationID: command.operationID,
                        status: .unknown, errorCode: "internal", completedAtMs: completedAtMs)
            case .unknown(let code, let completedAtMs):
                result = try await coordinator.durableCompleteUnknown(operationID: command.operationID,
                    errorCode: code, nowMs: completedAtMs) ?? NativeOperation(operationID: command.operationID,
                        status: .unknown, errorCode: "internal", completedAtMs: completedAtMs)
            }
            return result
        }
        inFlight[command.operationID] = (command, task)
        defer { inFlight.removeValue(forKey: command.operationID) }
        return try await task.value
    }
}
