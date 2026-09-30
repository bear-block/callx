#if os(iOS)
@preconcurrency import CallKit
@preconcurrency import AVFAudio
import Foundation

public protocol CallKitUUIDResolving: Sendable {
    func uuid(for callID: String) throws -> UUID
}
extension CallUUIDMap: CallKitUUIDResolving {}

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
    private let observerLock = NSLock()
    private var systemActionObserver: (@Sendable (CXAction) -> Void)?
    private var appliedActionObserver: (@Sendable (CXAction) -> Void)?
    public init(index: CallKitActionIndex, registry: PlatformActionRegistry,
        nowMs: @escaping @Sendable () -> Int64) { self.index = index; self.registry = registry; self.nowMs = nowMs }
    /// Receives actions the system started, such as an answer from the lock screen, after they are fulfilled.
    public func observeSystemActions(_ observer: (@Sendable (CXAction) -> Void)?) {
        observerLock.lock(); systemActionObserver = observer; observerLock.unlock()
    }
    /// Receives every fulfilled action, whether the system or a Callx command started it.
    public func observeAppliedActions(_ observer: (@Sendable (CXAction) -> Void)?) {
        observerLock.lock(); appliedActionObserver = observer; observerLock.unlock()
    }
    public func begin(_ action: CXAction) -> Bool {
        guard !action.isComplete, action.timeoutDate > Date() else {
            timedOut(action)
            return false
        }
        return index.begin(actionUUID: action.uuid)
    }
    public func applied(_ action: CXAction) {
        guard let completion = index.complete(actionUUID: action.uuid) else { return }
        let atMs = nowMs()
        guard !action.isComplete, action.timeoutDate > Date() else {
            if let operationID = completion.operationID {
                Task { await registry.timeout(operationID, atMs: atMs) }
            }
            return
        }
        action.fulfill()
        observerLock.lock(); let system = systemActionObserver; let applied = appliedActionObserver; observerLock.unlock()
        if let operationID = completion.operationID {
            Task { await registry.complete(operationID, with: .applied(completedAtMs: atMs)) }
        } else {
            system?(action)
        }
        applied?(action)
    }
    public func rejected(_ action: CXAction, errorCode: String = "platformRejected") {
        guard let completion = index.complete(actionUUID: action.uuid) else { return }
        let atMs = nowMs()
        guard !action.isComplete, action.timeoutDate > Date() else {
            if let operationID = completion.operationID {
                Task { await registry.timeout(operationID, atMs: atMs) }
            }
            return
        }
        action.fail()
        if let operationID = completion.operationID {
            Task { await registry.complete(operationID,
                with: .rejected(errorCode: errorCode, completedAtMs: atMs)) }
        }
    }
    public func timedOut(_ action: CXAction) {
        guard let operationID = index.remove(actionUUID: action.uuid) else { return }
        let atMs = nowMs()
        Task { await registry.timeout(operationID, atMs: atMs) }
    }
    public func providerReset() {
        let operations = index.reset()
        let atMs = nowMs()
        Task {
            for operationID in operations {
                await registry.complete(operationID, with: .providerReset(completedAtMs: atMs))
            }
            await registry.providerReset(atMs: atMs)
        }
    }
}

public enum CallKitActionKind: Sendable { case start(handle: String), answer, end, setMuted(Bool), setHeld(Bool) }
public protocol CallKitActionPerforming: Sendable {
    func perform(_ kind: CallKitActionKind, callUUID: UUID) async -> Bool
    func providerDidReset() async
}

/// Runs on the provider delegate queue. Configure that queue to match the media SDK's
/// threading requirements; activation alone must not be reported as mediaConnected.
public protocol CallKitAudioSessionHandling: Sendable {
    func didActivate(_ audioSession: AVAudioSession)
    func didDeactivate(_ audioSession: AVAudioSession)
}

/// Concrete CXProviderDelegate bridge. The host performer owns media/signaling work; CallKit is
/// fulfilled only after that work returns true.
@available(iOS 15.0, *)
public final class CallKitProviderDelegateAdapter: NSObject, CXProviderDelegate, @unchecked Sendable {
    private let performer: any CallKitActionPerforming
    private let lifecycle: CallKitActionLifecycle
    private let audio: (any CallKitAudioSessionHandling)?
    public init(performer: any CallKitActionPerforming, lifecycle: CallKitActionLifecycle,
        audio: (any CallKitAudioSessionHandling)? = nil) {
        self.performer = performer; self.lifecycle = lifecycle; self.audio = audio
    }
    public func providerDidReset(_ provider: CXProvider) {
        lifecycle.providerReset()
        Task { await performer.providerDidReset() }
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
    public func provider(_ provider: CXProvider, didActivate audioSession: AVAudioSession) {
        audio?.didActivate(audioSession)
    }
    public func provider(_ provider: CXProvider, didDeactivate audioSession: AVAudioSession) {
        audio?.didDeactivate(audioSession)
    }
    private func perform(_ kind: CallKitActionKind, action: CXCallAction) {
        guard lifecycle.begin(action) else { return }
        Task {
            if await performer.perform(kind, callUUID: action.callUUID) { lifecycle.applied(action) }
            else { lifecycle.rejected(action) }
        }
    }
}
#endif
