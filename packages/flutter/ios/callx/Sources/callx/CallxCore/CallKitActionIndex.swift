import Foundation

/// Tracks both SDK-submitted and system-originated actions. Completed records are removed;
/// late performer callbacks cannot claim an action after timeout or provider reset.
public final class CallKitActionIndex: @unchecked Sendable {
    public struct Completion: Sendable {
        public let operationID: String?
    }
    private struct Entry {
        let operationID: String?
        var performing: Bool
    }
    private let lock = NSLock()
    private var actions: [UUID: Entry] = [:]

    public init() {}
    public func register(actionUUID: UUID, operationID: String) {
        lock.withLock { actions[actionUUID] = Entry(operationID: operationID, performing: false) }
    }
    /// Claim performer execution exactly once while the action is outstanding.
    public func begin(actionUUID: UUID) -> Bool {
        lock.withLock {
            if var entry = actions[actionUUID] {
                guard !entry.performing else { return false }
                entry.performing = true
                actions[actionUUID] = entry
            } else {
                actions[actionUUID] = Entry(operationID: nil, performing: true)
            }
            return true
        }
    }
    public func complete(actionUUID: UUID) -> Completion? {
        lock.withLock {
            actions.removeValue(forKey: actionUUID).map { Completion(operationID: $0.operationID) }
        }
    }
    public func remove(actionUUID: UUID) -> String? { complete(actionUUID: actionUUID)?.operationID }
    public func reset() -> [String] {
        lock.withLock {
            let operations = actions.values.compactMap(\.operationID)
            actions.removeAll()
            return operations
        }
    }
}
