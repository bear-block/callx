public enum PlatformSubmission: Equatable, Sendable {
    case accepted
    case rejected(errorCode: String, completedAtMs: Int64)
}
public protocol PlatformTransactionSubmitter: Sendable {
    func submit(_ command: NativeCommand) async -> PlatformSubmission
}

/// Submission acceptance only means the OS queued the transaction. Applied is emitted solely
/// after the matching provider/action callback reaches the registry.
public struct RegistryBackedPlatformExecutor: PlatformCommandExecutor, Sendable {
    private let submitter: any PlatformTransactionSubmitter
    private let registry: PlatformActionRegistry
    public init(submitter: any PlatformTransactionSubmitter, registry: PlatformActionRegistry) {
        self.submitter = submitter; self.registry = registry
    }
    public func perform(_ command: NativeCommand) async -> PlatformOutcome {
        switch await submitter.submit(command) {
        case .rejected(let code, let time): return .rejected(errorCode: code, completedAtMs: time)
        case .accepted: break
        }
        switch await registry.outcome(for: command.operationID) {
        case .applied(let time): return .applied(completedAtMs: time)
        case .rejected(let code, let time): return .rejected(errorCode: code, completedAtMs: time)
        case .timedOut(let time): return .timedOut(completedAtMs: time)
        case .providerReset(let time): return .unknown(errorCode: "nativeUnavailable", completedAtMs: time)
        }
    }
}
