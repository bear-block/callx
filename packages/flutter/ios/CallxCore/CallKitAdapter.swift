#if os(iOS)
@preconcurrency import CallKit
import Foundation

public protocol CallKitUUIDResolving: Sendable {
    func uuid(for callID: String) throws -> UUID
}

public final class CallKitActionIndex: @unchecked Sendable {
    private let lock = NSLock()
    private var operations: [UUID: String] = [:]
    public init() {}
    public func register(actionUUID: UUID, operationID: String) { lock.withLock { operations[actionUUID] = operationID } }
    public func remove(actionUUID: UUID) -> String? { lock.withLock { operations.removeValue(forKey: actionUUID) } }
}

@available(iOS 15.0, *)
public final class CallKitTransactionSubmitter: PlatformTransactionSubmitter, @unchecked Sendable {
    private let controller: CXCallController
    private let resolver: any CallKitUUIDResolving
    private let index: CallKitActionIndex
    private let nowMs: @Sendable () -> Int64
    public init(controller: CXCallController = CXCallController(), resolver: any CallKitUUIDResolving,
        index: CallKitActionIndex, nowMs: @escaping @Sendable () -> Int64) {
        self.controller = controller; self.resolver = resolver; self.index = index; self.nowMs = nowMs
    }
    public func submit(_ command: NativeCommand) async -> PlatformSubmission {
        let callUUID: UUID
        do { callUUID = try resolver.uuid(for: command.callID) }
        catch { return .rejected(errorCode: "invalidArgument", completedAtMs: nowMs()) }
        let action: CXAction
        switch command.type {
        case .answer: action = CXAnswerCallAction(call: callUUID)
        case .end: action = CXEndCallAction(call: callUUID)
        case .setMuted:
            guard let value = command.value else { return .rejected(errorCode: "invalidArgument", completedAtMs: nowMs()) }
            action = CXSetMutedCallAction(call: callUUID, muted: value)
        case .setHeld:
            guard let value = command.value else { return .rejected(errorCode: "invalidArgument", completedAtMs: nowMs()) }
            action = CXSetHeldCallAction(call: callUUID, onHold: value)
        case .startCall:
            guard let handle = command.handle, !handle.isEmpty else {
                return .rejected(errorCode: "invalidArgument", completedAtMs: nowMs())
            }
            action = CXStartCallAction(call: callUUID, handle: CXHandle(type: .generic, value: handle))
        }
        let actionUUID = action.uuid
        index.register(actionUUID: actionUUID, operationID: command.operationID)
        return await withCheckedContinuation { continuation in
            controller.request(CXTransaction(action: action)) { [index, nowMs] error in
                if error == nil { continuation.resume(returning: .accepted) }
                else {
                    _ = index.remove(actionUUID: actionUUID)
                    continuation.resume(returning: .rejected(errorCode: "platformRejected", completedAtMs: nowMs()))
                }
            }
        }
    }
}

/// Called by CXProviderDelegate only after media/platform work has actually succeeded or failed.
@available(iOS 15.0, *)
public final class CallKitActionLifecycle: @unchecked Sendable {
    private let index: CallKitActionIndex
    private let registry: PlatformActionRegistry
    private let nowMs: @Sendable () -> Int64
    public init(index: CallKitActionIndex, registry: PlatformActionRegistry,
        nowMs: @escaping @Sendable () -> Int64) { self.index = index; self.registry = registry; self.nowMs = nowMs }
    public func applied(_ action: CXAction) {
        guard let operationID = index.remove(actionUUID: action.uuid) else { return }
        action.fulfill(); Task { await registry.complete(operationID, with: .applied(completedAtMs: nowMs())) }
    }
    public func rejected(_ action: CXAction, errorCode: String = "platformRejected") {
        guard let operationID = index.remove(actionUUID: action.uuid) else { return }
        action.fail(); Task { await registry.complete(operationID,
            with: .rejected(errorCode: errorCode, completedAtMs: nowMs())) }
    }
    public func timedOut(_ action: CXAction) {
        guard let operationID = index.remove(actionUUID: action.uuid) else { return }
        Task { await registry.timeout(operationID, atMs: nowMs()) }
    }
    public func providerReset() { Task { await registry.providerReset(atMs: nowMs()) } }
}

public enum CallKitActionKind: Sendable { case start(handle: String), answer, end, setMuted(Bool), setHeld(Bool) }
public protocol CallKitActionPerforming: Sendable {
    func perform(_ kind: CallKitActionKind, callUUID: UUID) async -> Bool
    func providerDidReset() async
}

/// Concrete CXProviderDelegate bridge. The host performer owns media/signaling work; CallKit is
/// fulfilled only after that work returns true.
@available(iOS 15.0, *)
public final class CallKitProviderDelegateAdapter: NSObject, CXProviderDelegate, @unchecked Sendable {
    private let performer: any CallKitActionPerforming
    private let lifecycle: CallKitActionLifecycle
    public init(performer: any CallKitActionPerforming, lifecycle: CallKitActionLifecycle) {
        self.performer = performer; self.lifecycle = lifecycle
    }
    public func providerDidReset(_ provider: CXProvider) {
        Task { await performer.providerDidReset(); lifecycle.providerReset() }
    }
    public func provider(_ provider: CXProvider, perform action: CXAnswerCallAction) {
        perform(.answer, action: action)
    }
    public func provider(_ provider: CXProvider, perform action: CXStartCallAction) {
        perform(.start(handle: action.handle.value), action: action)
    }
    public func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
        perform(.end, action: action)
    }
    public func provider(_ provider: CXProvider, perform action: CXSetMutedCallAction) {
        perform(.setMuted(action.isMuted), action: action)
    }
    public func provider(_ provider: CXProvider, perform action: CXSetHeldCallAction) {
        perform(.setHeld(action.isOnHold), action: action)
    }
    public func provider(_ provider: CXProvider, timedOutPerforming action: CXAction) {
        lifecycle.timedOut(action)
    }
    private func perform(_ kind: CallKitActionKind, action: CXCallAction) {
        Task {
            if await performer.perform(kind, callUUID: action.callUUID) { lifecycle.applied(action) }
            else { lifecycle.rejected(action) }
        }
    }
}
#endif
