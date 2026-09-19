public enum ReconciliationOutcome: Equatable, Sendable {
    case applied(observedAtMs: Int64)
    case rejected(errorCode: String, observedAtMs: Int64)
    case unavailable(observedAtMs: Int64)
}
public protocol OperationReconciliationProbe: Sendable {
    func query(_ command: NativeCommand) async -> ReconciliationOutcome
}

public struct RecoveredOperationReconciler: Sendable {
    private let coordinator: CallCoordinator
    private let probe: any OperationReconciliationProbe
    public init(coordinator: CallCoordinator, probe: any OperationReconciliationProbe) {
        self.coordinator = coordinator; self.probe = probe
    }
    public func reconcile(nowMs: Int64) async throws -> [NativeOperation] {
        var results: [NativeOperation] = []
        for command in await coordinator.pendingCommands() {
            if command.deadlineAtMs <= nowMs {
                try await coordinator.durableExpire(nowMs: nowMs)
            } else {
                switch await probe.query(command) {
                case .applied(let observed):
                    if let result = try await coordinator.durableCompleteApplied(operationID: command.operationID, nowMs: observed) { results.append(result) }
                case .rejected(let code, let observed):
                    if let result = try await coordinator.durableCompleteRejected(operationID: command.operationID, errorCode: code, nowMs: observed) { results.append(result) }
                case .unavailable(let observed):
                    if let result = try await coordinator.durableCompleteUnknown(operationID: command.operationID,
                        errorCode: "nativeUnavailable", nowMs: observed) { results.append(result) }
                }
            }
            if let result = await coordinator.operation(command.operationID), !results.contains(result) { results.append(result) }
        }
        return results
    }
}
