#if os(iOS)
@preconcurrency import CallKit
@preconcurrency import PushKit
import Foundation

/// Host callbacks for the library-owned incoming path. All methods have empty defaults.
public protocol CallKitIngressListener: AnyObject, Sendable {
    /// Upload this VoIP token to your backend for the signed-in account.
    func pushTokenUpdated(_ token: Data)
    func pushTokenInvalidated()
    /// The call now rings. Connect signaling and prepare media.
    func invitationAccepted(_ invitation: Invitation)
    /// No call rings for this push. `invitation` is nil when the payload could not be decoded;
    /// `outcome` is nil when the call could not be recorded or reported.
    func invitationRejected(_ invitation: Invitation?, outcome: IncomingOutcome?)
    func ringTimedOut(callID: String)
}
public extension CallKitIngressListener {
    func pushTokenUpdated(_ token: Data) {}
    func pushTokenInvalidated() {}
    func invitationAccepted(_ invitation: Invitation) {}
    func invitationRejected(_ invitation: Invitation?, outcome: IncomingOutcome?) {}
    func ringTimedOut(callID: String) {}
}

/// The CXProvider calls the ingress makes. `CXProvider` conforms; tests can supply a fake.
public protocol CallKitIncomingReporting: AnyObject {
    func reportNewIncomingCall(with uuid: UUID, update: CXCallUpdate) async throws
    func reportCall(with uuid: UUID, endedAt: Date?, reason: CXCallEndedReason)
    func reportOutgoingCall(with uuid: UUID, connectedAt: Date?)
}
extension CXProvider: CallKitIncomingReporting {}

/// Owns PushKit in BYO signaling mode: decode → coordinator outcome → CallKit report, in one step.
/// Do not create it when a provider SDK (for example Twilio Voice) owns PushKit and CallKit.
@available(iOS 15.0, *)
public final class CallKitIngress: NSObject, PKPushRegistryDelegate, @unchecked Sendable {
    private let runtime: BridgeRuntime
    private let reporter: any CallKitIncomingReporting
    private let uuids: CallUUIDMap
    private weak var listener: (any CallKitIngressListener)?
    private let ringTimeoutMs: Int64
    private let nowMs: @Sendable () -> Int64
    private let decode: @Sendable ([AnyHashable: Any]) throws -> Invitation?
    private let lock = NSLock()
    private var registry: PKPushRegistry?
    private var ringTimers: [String: DispatchWorkItem] = [:]

    /// Pass the same `uuids` to `CallKitTransactionSubmitter` and the `lifecycle` given to your
    /// `CallKitProviderDelegateAdapter`, so system-UI actions reach the coordinator.
    public init(runtime: BridgeRuntime, reporter: any CallKitIncomingReporting, uuids: CallUUIDMap,
        lifecycle: CallKitActionLifecycle? = nil, listener: (any CallKitIngressListener)? = nil,
        ringTimeoutMs: Int64 = 45_000, nowMs: @escaping @Sendable () -> Int64,
        decode: @escaping @Sendable ([AnyHashable: Any]) throws -> Invitation? = InvitationCodec.decode(pushPayload:)) {
        self.runtime = runtime; self.reporter = reporter; self.uuids = uuids; self.listener = listener
        self.ringTimeoutMs = ringTimeoutMs; self.nowMs = nowMs; self.decode = decode
        super.init()
        lifecycle?.observeSystemActions { [weak self] action in self?.systemActionApplied(action) }
    }

    /// Registers for VoIP pushes. Call once, early in application launch.
    public func startPushRegistry(queue: DispatchQueue = .main) {
        let registry = PKPushRegistry(queue: queue)
        registry.delegate = self
        registry.desiredPushTypes = [.voIP]
        lock.lock(); self.registry = registry; lock.unlock()
    }

    public func pushRegistry(_ registry: PKPushRegistry, didUpdate credentials: PKPushCredentials, for type: PKPushType) {
        listener?.pushTokenUpdated(credentials.token)
    }
    public func pushRegistry(_ registry: PKPushRegistry, didInvalidatePushTokenFor type: PKPushType) {
        listener?.pushTokenInvalidated()
    }
    /// Before iOS 26.4 every VoIP push must be reported to CallKit.
    public func pushRegistry(_ registry: PKPushRegistry, didReceiveIncomingPushWith payload: PKPushPayload,
        for type: PKPushType, completion: @escaping () -> Void) {
        receive(payload.dictionaryPayload, mustReport: true, completion: completion)
    }
    @available(iOS 26.4, *)
    public func pushRegistry(_ registry: PKPushRegistry, didReceiveIncomingVoIPPushWith payload: PKPushPayload,
        metadata: PKVoIPPushMetadata, withCompletionHandler completion: @escaping () -> Void) {
        receive(payload.dictionaryPayload, mustReport: metadata.mustReport, completion: completion)
    }

    /// Handles an invitation that arrived over signaling while the app runs; no report is forced.
    @discardableResult
    public func handleInvitation(_ invitation: Invitation) async -> IncomingOutcome? {
        await process(invitation, mustReport: false)
    }

    /// Ends the call for a remote terminal event, or records it so a late invitation cannot ring.
    public func remoteEnded(callID: String, reason: String = "remoteEnded") async throws {
        let ended = try await runtime.remoteEnded(callID: callID, reason: reason)
        cancelRing(callID)
        if ended { reporter.reportCall(with: uuids.uuid(for: callID), endedAt: Date(), reason: Self.endedReason(reason)) }
    }

    /// Records that the remote party accepted an outgoing call and tells CallKit it connected.
    public func remoteAnswered(callID: String) async throws {
        if try await runtime.remoteAnswered(callID: callID) {
            reporter.reportOutgoingCall(with: uuids.uuid(for: callID), connectedAt: Date())
        }
    }

    func receive(_ payload: [AnyHashable: Any], mustReport: Bool, completion: @escaping () -> Void) {
        let invitation = try? decode(payload)
        let done = CompletionBox(completion)
        Task {
            await self.process(invitation, mustReport: mustReport)
            done.call()
        }
    }

    @discardableResult
    private func process(_ invitation: Invitation?, mustReport: Bool) async -> IncomingOutcome? {
        guard let invitation else {
            await apply(.reportEnded(reason: "failed"), mustReport: mustReport, callID: nil, update: nil)
            listener?.invitationRejected(nil, outcome: nil)
            return nil
        }
        let now = nowMs()
        let outcome: IncomingOutcome
        do {
            outcome = try await runtime.reportIncoming(callID: invitation.callID, displayName: invitation.displayName,
                handle: invitation.handle, observedAtMs: now, ringDeadlineAtMs: now + ringTimeoutMs,
                expiresAtMs: invitation.expiresAtMs)
        } catch {
            await apply(.reportEnded(reason: "failed"), mustReport: mustReport, callID: nil, update: nil)
            listener?.invitationRejected(invitation, outcome: nil)
            return nil
        }
        let update = Self.update(for: invitation)
        let decision = IncomingReportPolicy.decide(outcome, mustReport: mustReport)
        if decision == .ring {
            do { try await reporter.reportNewIncomingCall(with: uuids.uuid(for: invitation.callID), update: update) }
            catch {
                // CallKit refused (for example Do Not Disturb or a blocked handle): no call rang.
                _ = try? await runtime.platformEnded(callID: invitation.callID, reason: "failed")
                listener?.invitationRejected(invitation, outcome: nil)
                return outcome
            }
            let deadline = [now + ringTimeoutMs, invitation.expiresAtMs].compactMap { $0 }.min()!
            scheduleRing(invitation.callID, deadline: deadline)
            listener?.invitationAccepted(invitation)
            return outcome
        }
        await apply(decision, mustReport: mustReport, callID: invitation.callID, update: update)
        if let reason = IncomingReportPolicy.tombstoneReason(outcome) {
            _ = try? await runtime.remoteEnded(callID: invitation.callID, reason: reason)
        }
        listener?.invitationRejected(invitation, outcome: outcome)
        return outcome
    }

    private func apply(_ decision: IncomingReportDecision, mustReport: Bool, callID: String?, update: CXCallUpdate?) async {
        switch decision {
        case .ring, .skip: return
        case .reportExisting:
            // The live call keeps ringing; CallKit answers with callUUIDAlreadyExists.
            guard let callID else { return }
            _ = try? await reporter.reportNewIncomingCall(with: uuids.uuid(for: callID), update: update ?? CXCallUpdate())
        case .reportEnded(let reason):
            // A fresh UUID can never end another call.
            let uuid = UUID()
            _ = try? await reporter.reportNewIncomingCall(with: uuid, update: update ?? CXCallUpdate())
            reporter.reportCall(with: uuid, endedAt: nil, reason: Self.endedReason(reason))
        }
    }

    private func systemActionApplied(_ action: CXAction) {
        guard let call = action as? CXCallAction, let callID = uuids.callID(for: call.callUUID) else { return }
        if action is CXAnswerCallAction {
            cancelRing(callID)
            Task { _ = try? await runtime.platformAnswered(callID: callID) }
        } else if action is CXEndCallAction {
            cancelRing(callID)
            Task { _ = try? await runtime.platformEnded(callID: callID) }
        } else if let mute = action as? CXSetMutedCallAction {
            let muted = mute.isMuted
            Task { _ = try? await runtime.platformMuted(callID: callID, muted: muted) }
        } else if let hold = action as? CXSetHeldCallAction {
            let held = hold.isOnHold
            Task { _ = try? await runtime.platformHeld(callID: callID, held: held) }
        }
    }

    private func scheduleRing(_ callID: String, deadline: Int64) {
        let work = DispatchWorkItem { [weak self] in
            guard let self else { return }
            Task { await self.ringExpired(callID) }
        }
        lock.lock(); ringTimers[callID]?.cancel(); ringTimers[callID] = work; lock.unlock()
        let delay = max(0, deadline - nowMs())
        DispatchQueue.main.asyncAfter(deadline: .now() + .milliseconds(Int(delay)), execute: work)
    }
    private func cancelRing(_ callID: String) {
        lock.lock(); ringTimers.removeValue(forKey: callID)?.cancel(); lock.unlock()
    }
    private func forgetRing(_ callID: String) {
        lock.lock(); ringTimers.removeValue(forKey: callID); lock.unlock()
    }
    private func ringExpired(_ callID: String) async {
        forgetRing(callID)
        guard let ended = try? await runtime.expireRinging(), ended == callID else { return }
        reporter.reportCall(with: uuids.uuid(for: callID), endedAt: Date(), reason: .unanswered)
        listener?.ringTimedOut(callID: callID)
    }

    static func update(for invitation: Invitation) -> CXCallUpdate {
        let update = CXCallUpdate()
        update.remoteHandle = CXHandle(type: .generic, value: invitation.handle)
        update.localizedCallerName = invitation.displayName
        update.hasVideo = false
        return update
    }

    static func endedReason(_ reason: String) -> CXCallEndedReason {
        switch reason {
        case "unanswered": return .unanswered
        case "answeredElsewhere": return .answeredElsewhere
        case "declinedElsewhere": return .declinedElsewhere
        case "failed", "busy": return .failed
        default: return .remoteEnded
        }
    }
}

private final class CompletionBox: @unchecked Sendable {
    private let completion: () -> Void
    init(_ completion: @escaping () -> Void) { self.completion = completion }
    func call() { DispatchQueue.main.async { self.completion() } }
}
#endif
