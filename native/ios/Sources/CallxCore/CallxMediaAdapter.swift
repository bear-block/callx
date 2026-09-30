#if os(iOS)
@preconcurrency import AVFAudio
import Foundation

/// The media adapter API this core supports. An adapter built for another version is refused.
public let callxMediaAPIVersion = 1

/// The adapter's only way into call state: readiness and interruption, never an end or a hold.
public protocol CallxMediaSink: Sendable {
    /// Remote media flows: first connection, or recovery after `interrupted()`.
    func connected()
    /// Connected media dropped, for example while the provider reconnects.
    func interrupted()
}

/// Carries a call's media (ADR-0009). Pass it as `media` to `CallKitIngress`, as `audio` to
/// `CallKitProviderDelegateAdapter`, and wrap your performer in `MediaRoutingPerformer`. The
/// ingress starts it when the call is answered from any surface and stops it when the call ends
/// for any reason. Start audio only in `didActivate`, stop it in `didDeactivate`; CallKit owns
/// the audio session.
public protocol CallxMediaAdapter: CallKitAudioSessionHandling, AnyObject {
    /// Must equal `callxMediaAPIVersion`.
    var apiVersion: Int { get }
    /// The call was answered. Return at once and connect asynchronously.
    func start(callID: String, sink: any CallxMediaSink)
    /// The call ended, or never rang. Idempotent.
    func stop(callID: String)
    /// Mute from the app or CallKit. False when the media cannot follow.
    func setMuted(callID: String, muted: Bool) async -> Bool
}

public extension CallxMediaAdapter {
    var apiVersion: Int { callxMediaAPIVersion }
}

/// Wraps the host performer so CallKit mute actions reach the media adapter; the action is
/// fulfilled only when the media followed.
public final class MediaRoutingPerformer: CallKitActionPerforming, @unchecked Sendable {
    private let performer: any CallKitActionPerforming
    private let media: any CallxMediaAdapter
    private let uuids: CallUUIDMap
    public init(performer: any CallKitActionPerforming, media: any CallxMediaAdapter, uuids: CallUUIDMap) {
        self.performer = performer; self.media = media; self.uuids = uuids
    }
    public func perform(_ kind: CallKitActionKind, callUUID: UUID) async -> Bool {
        if case .setMuted(let muted) = kind, let callID = uuids.callID(for: callUUID),
           await !media.setMuted(callID: callID, muted: muted) { return false }
        return await performer.perform(kind, callUUID: callUUID)
    }
    public func providerDidReset() async { await performer.providerDidReset() }
}

/// Applies sink reports to the runtime in the order the adapter made them.
final class OrderedMediaSink: CallxMediaSink, @unchecked Sendable {
    private let runtime: BridgeRuntime
    private let callID: String
    private let lock = NSLock()
    private var last: Task<Void, Never>?
    init(runtime: BridgeRuntime, callID: String) { self.runtime = runtime; self.callID = callID }
    func connected() { enqueue { [runtime, callID] in try? await runtime.mediaConnected(callID: callID) } }
    func interrupted() { enqueue { [runtime, callID] in _ = try? await runtime.mediaInterrupted(callID: callID) } }
    private func enqueue(_ work: @escaping @Sendable () async -> Void) {
        lock.lock(); defer { lock.unlock() }
        let previous = last
        last = Task { await previous?.value; await work() }
    }
    /// Test hook: waits for reports made so far.
    func drain() async { await lock.withLock { last }?.value }
}
#endif
