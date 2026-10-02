#if os(iOS)
@preconcurrency import AVFAudio
import Foundation
import UIKit

/// The audio media adapter API. An adapter built for a version this core does not know is refused.
public let callxMediaAPIVersion = 1
/// The video media adapter API: `CallxVideoAdapter` (ADR-0010).
public let callxVideoAPIVersion = 2

/// True when this core can run `adapter`: version 1, or version 2 conforming to `CallxVideoAdapter`.
public func callxSupportsMediaAdapter(_ adapter: any CallxMediaAdapter) -> Bool {
    switch adapter.apiVersion {
    case callxMediaAPIVersion: return true
    case callxVideoAPIVersion: return adapter is any CallxVideoAdapter
    default: return false
    }
}

/// The adapter's only way into call state: readiness and interruption, never an end or a hold.
public protocol CallxMediaSink: Sendable {
    /// Remote media flows: first connection, or recovery after `interrupted()`.
    func connected()
    /// Connected media dropped, for example while the provider reconnects.
    func interrupted()
    /// Video changed (video adapters only). `localVideo` can only be `.blocked` (the OS took the
    /// camera) or `.on` (it gave it back); `remoteVideo` is whether a remote video track can be
    /// rendered. Pass nil for what did not change.
    func videoChanged(localVideo: LocalVideo?, remoteVideo: Bool?)
}

public extension CallxMediaSink {
    func videoChanged(localVideo: LocalVideo?, remoteVideo: Bool?) {}
}

/// Which video a `CallxVideoSurface` shows.
public enum VideoSource: String, Sendable { case local, remote }

/// A framework view's container for one video source. The adapter adds its own renderer view to
/// `container` on `attach` and removes it on `detach`. The core never sees frames.
public final class CallxVideoSurface: @unchecked Sendable {
    public enum Fit: String, Sendable { case cover, contain }
    public let container: UIView
    public let fit: Fit
    /// Mirror horizontally, usually for the front camera's local preview.
    public let mirror: Bool
    public init(container: UIView, fit: Fit = .cover, mirror: Bool = false) {
        self.container = container; self.fit = fit; self.mirror = mirror
    }
}

/// Why the camera could not follow a command. Each maps to the contract error code of the same name.
public enum CallxCameraError: String, Error, Sendable { case permissionDenied, mediaNotReady, platformRejected }

/// A media adapter that also carries video in the call's room (ADR-0010, adapter API 2). The core
/// calls `setCamera` for `setCamera` and `switchCamera` commands, and `attach`/`detach` when a
/// `CallxVideoView` mounts or unmounts.
public protocol CallxVideoAdapter: CallxMediaAdapter {
    /// Publishes the camera facing `facing`, switches it while it is on, or stops publishing when
    /// `on` is false. Return nil once applied, or the reason it was not. The core checks that the
    /// app is in the foreground before turning the camera on.
    func setCamera(callID: String, on: Bool, facing: CameraFacing) async -> CallxCameraError?
    /// Render `source` of `callID` into `surface` once it exists, until `detach`. Main thread.
    @MainActor func attach(callID: String, source: VideoSource, surface: CallxVideoSurface)
    /// Stop rendering into `surface`. Idempotent. Main thread.
    @MainActor func detach(callID: String, surface: CallxVideoSurface)
}

public extension CallxVideoAdapter {
    var apiVersion: Int { callxVideoAPIVersion }
}

/// Carries a call's media (ADR-0009). Pass it as `media` to `CallKitIngress`, as `audio` to
/// `CallKitProviderDelegateAdapter`, and wrap your performer in `MediaRoutingPerformer`. The
/// ingress starts it when the call is answered from any surface and stops it when the call ends
/// for any reason. Start audio only in `didActivate`, stop it in `didDeactivate`; CallKit owns
/// the audio session.
public protocol CallxMediaAdapter: CallKitAudioSessionHandling, AnyObject {
    /// `callxMediaAPIVersion`; a `CallxVideoAdapter` reports `callxVideoAPIVersion`.
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
    func videoChanged(localVideo: LocalVideo?, remoteVideo: Bool?) {
        enqueue { [runtime, callID] in
            _ = try? await runtime.videoObserved(callID: callID, localVideo: localVideo, remoteVideo: remoteVideo)
        }
    }
    private func enqueue(_ work: @escaping @Sendable () async -> Void) {
        lock.lock(); defer { lock.unlock() }
        let previous = last
        last = Task { await previous?.value; await work() }
    }
    /// Test hook: waits for reports made so far.
    func drain() async { await lock.withLock { last }?.value }
}
/// Routes `setCamera` and `switchCamera` to a `CallxVideoAdapter` and every other command to
/// `inner` (ADR-0010). Switching while the camera is off only records the choice for the next
/// `setCamera(true)`. Set `currentCall` once the runtime exists; `CallxBootstrap` does.
public final class CallxCameraExecutor: PlatformCommandExecutor, @unchecked Sendable {
    private let inner: any PlatformCommandExecutor
    private let video: (any CallxVideoAdapter)?
    private let isForeground: @Sendable () async -> Bool
    private let nowMs: @Sendable () -> Int64
    private let lock = NSLock()
    private var current: (@Sendable () async -> CallRecord?)?
    private var applied: (@Sendable (_ callID: String, _ cameraOn: Bool) -> Void)?
    public init(inner: any PlatformCommandExecutor, video: (any CallxVideoAdapter)?,
        nowMs: @escaping @Sendable () -> Int64,
        isForeground: @escaping @Sendable () async -> Bool = { await MainActor.run { UIApplication.shared.applicationState == .active } }) {
        self.inner = inner; self.video = video; self.nowMs = nowMs; self.isForeground = isForeground
    }
    /// The live call, to know the chosen camera and whether it is on.
    public func setCurrentCall(_ value: @escaping @Sendable () async -> CallRecord?) { lock.withLock { current = value } }
    /// Called after a camera command was applied, for example to update CallKit's `hasVideo`.
    public func onCameraApplied(_ value: @escaping @Sendable (_ callID: String, _ cameraOn: Bool) -> Void) {
        lock.withLock { applied = value }
    }

    public func perform(_ command: NativeCommand) async -> PlatformOutcome {
        guard command.type == .setCamera || command.type == .switchCamera else { return await inner.perform(command) }
        guard let video else { return .rejected(errorCode: "unsupported", completedAtMs: nowMs()) }
        guard let call = await lock.withLock({ current })?(), call.callID == command.callID else {
            return .rejected(errorCode: "callNotFound", completedAtMs: nowMs())
        }
        let cameraLive = call.localVideo != .off
        let on: Bool, facing: CameraFacing
        if command.type == .setCamera {
            guard let value = command.value else { return .rejected(errorCode: "invalidArgument", completedAtMs: nowMs()) }
            on = value; facing = call.cameraFacing ?? .front
        } else {
            guard let chosen = command.facing else { return .rejected(errorCode: "invalidArgument", completedAtMs: nowMs()) }
            if !cameraLive { return .applied(completedAtMs: nowMs()) }
            on = true; facing = chosen
        }
        if on, !cameraLive, await !isForeground() { return .rejected(errorCode: "mediaNotReady", completedAtMs: nowMs()) }
        if let error = await video.setCamera(callID: command.callID, on: on, facing: facing) {
            return .rejected(errorCode: error.rawValue, completedAtMs: nowMs())
        }
        lock.withLock { applied }?(command.callID, on)
        return .applied(completedAtMs: nowMs())
    }
}
#endif
