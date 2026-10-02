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
    /// The call was answered: from CallKit, your app, or by the remote side of an outgoing call.
    /// Prepare media here; start audio only in `CXProviderDelegate.provider(_:didActivate:)`.
    func callAnswered(callID: String)
    /// The call ended for any reason, including one that never rang. Stop media.
    func callEnded(callID: String)
}
public extension CallKitIngressListener {
    func pushTokenUpdated(_ token: Data) {}
    func pushTokenInvalidated() {}
    func invitationAccepted(_ invitation: Invitation) {}
    func invitationRejected(_ invitation: Invitation?, outcome: IncomingOutcome?) {}
    func ringTimedOut(callID: String) {}
    func callAnswered(callID: String) {}
    func callEnded(callID: String) {}
}

/// The CXProvider calls the ingress makes. `CXProvider` conforms; tests can supply a fake.
public protocol CallKitIncomingReporting: AnyObject {
    func reportNewIncomingCall(with uuid: UUID, update: CXCallUpdate) async throws
    func reportCall(with uuid: UUID, endedAt: Date?, reason: CXCallEndedReason)
    func reportOutgoingCall(with uuid: UUID, connectedAt: Date?)
    func reportCall(with uuid: UUID, updated update: CXCallUpdate)
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
    private let media: (any CallxMediaAdapter)?
    private let ringTimeoutMs: Int64
    private let nowMs: @Sendable () -> Int64
    private let decode: @Sendable ([AnyHashable: Any]) throws -> Invitation?
    private let lock = NSRecursiveLock()
    private enum RegistrationAction { case ringing, answered, ended(String?) }
    // Only in-flight reports are tracked; the durable ledger remains the source of terminal history.
    private var registrations: [String: RegistrationAction] = [:]
    private var registry: PKPushRegistry?
    private var ringTimers: [String: DispatchWorkItem] = [:]
    // Each call is announced answered and ended at most once; the ended set is bounded.
    private var announcedAnswered: Set<String> = []
    private var announcedEnded: [String] = []

    /// Pass the same `uuids` to `CallKitTransactionSubmitter` and the `lifecycle` given to your
    /// `CallKitProviderDelegateAdapter`, so system-UI actions reach the coordinator.
    public init(runtime: BridgeRuntime, reporter: any CallKitIncomingReporting, uuids: CallUUIDMap,
        lifecycle: CallKitActionLifecycle? = nil, listener: (any CallKitIngressListener)? = nil,
        media: (any CallxMediaAdapter)? = nil,
        ringTimeoutMs: Int64 = 45_000, nowMs: @escaping @Sendable () -> Int64,
        decode: @escaping @Sendable ([AnyHashable: Any]) throws -> Invitation? = InvitationCodec.decode(pushPayload:)) {
        precondition(media.map(Self.supports) ?? true, "Media adapter API \(media?.apiVersion ?? 0) is not supported; " +
            "this Callx supports \(callxMediaAPIVersion), and \(callxVideoAPIVersion) for video adapters.")
        self.runtime = runtime; self.reporter = reporter; self.uuids = uuids; self.listener = listener
        self.media = media
        self.ringTimeoutMs = ringTimeoutMs; self.nowMs = nowMs; self.decode = decode
        super.init()
        lifecycle?.observeSystemActions { [weak self] action in self?.systemActionApplied(action) }
        lifecycle?.observeAppliedActions { [weak self] action in self?.actionApplied(action) }
    }

    /// True when this core can drive `adapter`. Check before passing it to `init`.
    public static func supports(_ adapter: any CallxMediaAdapter) -> Bool { callxSupportsMediaAdapter(adapter) }

    /// Tells CallKit whether the call shows video, after the camera turned on or off (ADR-0010).
    public func cameraChanged(callID: String, on: Bool) {
        let update = CXCallUpdate()
        update.hasVideo = on
        reporter.reportCall(with: uuids.uuid(for: callID), updated: update)
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
        if ended { markRegistration(callID, action: .ended(reason)) }
        cancelRing(callID)
        if ended {
            reporter.reportCall(with: uuids.uuid(for: callID), endedAt: Date(), reason: Self.endedReason(reason))
            announceEnded(callID)
        }
    }

    /// Cold-process bootstrap only: terminate checkpoint calls whose media session was lost.
    /// Run before starting PushKit or installing the framework runtime, not on engine reattach.
    @discardableResult
    public func recoverAfterProcessDeath() async throws -> CallRecord? {
        guard let call = try await runtime.recoverAfterProcessDeath() else { return nil }
        cancelRing(call.callID)
        reporter.reportCall(with: uuids.uuid(for: call.callID), endedAt: Date(),
            reason: Self.endedReason(call.endReason ?? "failed"))
        announceEnded(call.callID)
        return call
    }

    /// Records that the remote party accepted an outgoing call and tells CallKit it connected.
    public func remoteAnswered(callID: String) async throws {
        if try await runtime.remoteAnswered(callID: callID) {
            reporter.reportOutgoingCall(with: uuids.uuid(for: callID), connectedAt: Date())
            announceAnswered(callID)
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
                expiresAtMs: invitation.expiresAtMs, video: invitation.video)
        } catch {
            await apply(.reportEnded(reason: "failed"), mustReport: mustReport, callID: nil, update: nil)
            listener?.invitationRejected(invitation, outcome: nil)
            return nil
        }
        let update = Self.update(for: invitation)
        let decision = IncomingReportPolicy.decide(outcome, mustReport: mustReport)
        if decision == .ring {
            beginRegistration(invitation.callID)
            do { try await reporter.reportNewIncomingCall(with: uuids.uuid(for: invitation.callID), update: update) }
            catch {
                forgetRegistration(invitation.callID)
                // CallKit refused (for example Do Not Disturb or a blocked handle): no call rang.
                _ = try? await runtime.platformEnded(callID: invitation.callID, reason: "failed")
                listener?.invitationRejected(invitation, outcome: nil)
                return outcome
            }
            do {
                // OS reporting suspends; cancel, answer or expiry may have won in the meantime.
                _ = try await runtime.expireRinging(callID: invitation.callID)
                let current = await runtime.currentCall()
                return finishRegistration(invitation, current: current)
            } catch {
                forgetRegistration(invitation.callID)
                reporter.reportCall(with: uuids.uuid(for: invitation.callID), endedAt: Date(), reason: .failed)
                listener?.invitationRejected(invitation, outcome: nil)
                return nil
            }
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
            markRegistration(callID, action: .answered)
            cancelRing(callID)
            Task { _ = try? await runtime.platformAnswered(callID: callID) }
        } else if action is CXEndCallAction {
            markRegistration(callID, action: .ended(nil))
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

    private func actionApplied(_ action: CXAction) {
        guard let call = action as? CXCallAction, let callID = uuids.callID(for: call.callUUID) else { return }
        if action is CXAnswerCallAction { announceAnswered(callID) }
        else if action is CXEndCallAction { announceEnded(callID) }
    }
    private func announceAnswered(_ callID: String) {
        lock.lock()
        let first = !announcedEnded.contains(callID) && announcedAnswered.insert(callID).inserted
        lock.unlock()
        if first {
            media?.start(callID: callID, sink: OrderedMediaSink(runtime: runtime, callID: callID))
            listener?.callAnswered(callID: callID)
        }
    }
    private func announceEnded(_ callID: String) {
        lock.lock()
        let first = !announcedEnded.contains(callID)
        if first {
            announcedAnswered.remove(callID); announcedEnded.append(callID)
            if announcedEnded.count > 64 { announcedEnded.removeFirst() }
        }
        lock.unlock()
        if first { media?.stop(callID: callID); listener?.callEnded(callID: callID) }
    }

    private func beginRegistration(_ callID: String) {
        lock.lock(); defer { lock.unlock() }
        registrations[callID] = .ringing
    }
    private func forgetRegistration(_ callID: String) {
        lock.lock(); defer { lock.unlock() }
        registrations.removeValue(forKey: callID)
    }
    private func markRegistration(_ callID: String, action: RegistrationAction) {
        lock.lock(); defer { lock.unlock() }
        guard let previous = registrations[callID] else { return }
        if case .ended = previous { return }
        registrations[callID] = action
    }
    private func finishRegistration(_ invitation: Invitation, current: CallRecord?) -> IncomingOutcome {
        lock.lock(); defer { lock.unlock() }
        let action = registrations.removeValue(forKey: invitation.callID)
        let reason: String?
        if current?.callID == invitation.callID, current?.state == .ended {
            reason = current?.endReason ?? "failed"
        } else if case .ended(let endedReason) = action {
            reason = endedReason ?? (current?.state == .incoming ? "declined" : "localHangup")
        } else if current?.callID != invitation.callID { reason = "failed" }
        else { reason = nil }
        if let reason {
            reporter.reportCall(with: uuids.uuid(for: invitation.callID), endedAt: Date(), reason: Self.endedReason(reason))
            let outcome = IncomingOutcome.ended(reason: reason)
            listener?.invitationRejected(invitation, outcome: outcome)
            announceEnded(invitation.callID)
            return outcome
        }
        if case .answered = action {
            // An answer callback may still be on its way to the coordinator; do not restart its timer.
        } else if current?.state == .incoming, let deadline = current?.ringDeadlineAtMs {
            scheduleRing(invitation.callID, deadline: deadline)
        }
        listener?.invitationAccepted(invitation)
        return .accepted
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
        guard let ended = try? await runtime.expireRinging(callID: callID), ended == callID else { return }
        reporter.reportCall(with: uuids.uuid(for: callID), endedAt: Date(), reason: .unanswered)
        listener?.ringTimedOut(callID: callID)
        announceEnded(callID)
    }

    static func update(for invitation: Invitation) -> CXCallUpdate {
        let update = CXCallUpdate()
        update.remoteHandle = CXHandle(type: .generic, value: invitation.handle)
        update.localizedCallerName = invitation.displayName
        update.hasVideo = invitation.video
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
