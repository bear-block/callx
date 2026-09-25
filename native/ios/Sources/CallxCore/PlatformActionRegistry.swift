public enum PlatformActionOutcome: Equatable, Sendable {
    case applied(completedAtMs: Int64)
    case rejected(errorCode: String, completedAtMs: Int64)
    case timedOut(completedAtMs: Int64)
    case providerReset(completedAtMs: Int64)
}

/// Correlates OS action callbacks with commands. First terminal callback wins. A callback may
/// arrive before the bridge/dispatcher starts waiting and is buffered by operation ID.
public actor PlatformActionRegistry {
    private var buffered: [String: PlatformActionOutcome] = [:]
    private var waiters: [String: CheckedContinuation<PlatformActionOutcome, Never>] = [:]
    private var terminalIDs: Set<String> = []

    public init() {}
    func isPending(_ operationID: String) -> Bool { waiters[operationID] != nil }
    public func outcome(for operationID: String) async -> PlatformActionOutcome {
        if let outcome = buffered.removeValue(forKey: operationID) { return outcome }
        return await withCheckedContinuation { waiters[operationID] = $0 }
    }
    @discardableResult public func complete(_ operationID: String,
        with outcome: PlatformActionOutcome) -> Bool {
        guard terminalIDs.insert(operationID).inserted else { return false }
        if let waiter = waiters.removeValue(forKey: operationID) { waiter.resume(returning: outcome) }
        else { buffered[operationID] = outcome }
        return true
    }
    public func timeout(_ operationID: String, atMs: Int64) {
        complete(operationID, with: .timedOut(completedAtMs: atMs))
    }
    public func providerReset(atMs: Int64) {
        let pending = Set(waiters.keys).union(buffered.keys)
        for operationID in pending { complete(operationID, with: .providerReset(completedAtMs: atMs)) }
    }
}
