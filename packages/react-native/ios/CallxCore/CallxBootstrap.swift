#if os(iOS)
@preconcurrency import CallKit
import Foundation

/// What the host chooses; everything has a working default.
public struct CallxBootstrapConfig {
    /// Rotate on sign-out or account switch; it isolates the checkpoint.
    public var accountGeneration = "default"
    /// Application-private checkpoint; defaults to `Application Support/callx/<accountGeneration>/coordinator.json`.
    public var checkpointURL: URL?
    /// Defaults to one call, generic handles, and video when the media adapter carries video.
    public var providerConfiguration: CXProviderConfiguration?
    public var listener: (any CallKitIngressListener)?
    /// Backend and signaling work for each CallKit action; defaults to accepting them.
    public var performer: (any CallKitActionPerforming)?
    /// Media: an explicit adapter wins; otherwise the adapter an installed package declares is
    /// used (ADR-0009). Hosts that run media from listener callbacks pass `audio` instead.
    public var media: (any CallxMediaAdapter)?
    public var discoverMedia = true
    public var audio: (any CallKitAudioSessionHandling)?
    public var reconciliationProbe: (any OperationReconciliationProbe)?
    /// Register for VoIP pushes once recovery finishes. Off for hosts that ring only from signaling.
    public var startPushRegistry = true
    /// Donate each answered call to Siri so the system can suggest calling back (ADR-0013).
    public var donateCalls = true
    public var log: @Sendable (String) -> Void = { _ in }
    public init() {}
}

/// How media is provided after bootstrap.
public enum CallxMediaStatus: Sendable, Equatable {
    case adapter(source: String)
    /// CallKit audio activation goes to the host; media runs from listener callbacks.
    case hostControlled
    /// Calls ring and connect, without media.
    case none(reason: String?)
}

public enum CallxBootstrapError: Error, CustomStringConvertible {
    case mediaAdapterConflict([String])
    public var description: String {
        switch self {
        case .mediaAdapterConflict(let sources):
            "More than one Callx media adapter is installed (\(sources.joined(separator: ", "))); keep one."
        }
    }
}

/// The native pipeline in one call from `application(_:didFinishLaunchingWithOptions:)`, before
/// PushKit can deliver (ADR-0009): CXProvider, action lifecycle, executor, durable coordinator,
/// runtime, ingress, media, cold-process recovery, PushKit and reconciliation. The framework
/// package installs the runtime through `install`.
@available(iOS 15.0, *)
public final class CallxBootstrap: @unchecked Sendable {
    public let runtime: BridgeRuntime
    public let ingress: CallKitIngress
    public let provider: CXProvider
    public let uuids: CallUUIDMap
    public let media: CallxMediaStatus
    /// Completes after cold-process recovery, with the call a previous process left behind (now
    /// ended; tell your backend). Wait for it before letting Dart or JavaScript call setup.
    public let ready: Task<CallRecord?, Error>
    private let delegate: CallKitProviderDelegateAdapter
    private let routes: CallxAudioRoutes
    private let tokenRecorder: PushTokenRecorder

    nonisolated(unsafe) public private(set) static var started: CallxBootstrap?
    private static let lock = NSLock()

    /// Idempotent per process. Throws when more than one media adapter is installed or the
    /// checkpoint cannot be read; never install an empty runtime over a storage error.
    @discardableResult
    public static func start(_ config: CallxBootstrapConfig = CallxBootstrapConfig(),
        install: @escaping @Sendable (BridgeRuntime) -> Void) throws -> CallxBootstrap {
        lock.lock(); defer { lock.unlock() }
        if let started { return started }
        let bootstrap = try CallxBootstrap(config, install: install)
        started = bootstrap
        return bootstrap
    }

    private init(_ config: CallxBootstrapConfig, install: @escaping @Sendable (BridgeRuntime) -> Void) throws {
        let nowMs: @Sendable () -> Int64 = { Int64(Date().timeIntervalSince1970 * 1000) }
        let (adapter, status) = try Self.resolveMedia(config)
        let video = adapter as? any CallxVideoAdapter
        let provider = CXProvider(configuration: config.providerConfiguration ?? Self.defaultConfiguration(video: video != nil))
        let uuids = CallUUIDMap()
        let actionIndex = CallKitActionIndex()
        let registry = PlatformActionRegistry()
        let lifecycle = CallKitActionLifecycle(index: actionIndex, registry: registry, nowMs: nowMs)
        let routes = CallxAudioRoutes()
        let dtmf = adapter as? any CallxDTMFAdapter
        let ingressRef = IngressReference()
        let features = CallxCallFeatureExecutor(inner: RegistryBackedPlatformExecutor(
            submitter: CallKitTransactionSubmitter(resolver: uuids, index: actionIndex, nowMs: nowMs), registry: registry),
            dtmf: dtmf, routes: routes,
            rename: { callID, name in ingressRef.ingress?.rename(callID: callID, displayName: name) }, nowMs: nowMs)
        let executor = CallxCameraExecutor(inner: features, video: video, nowMs: nowMs)
        let hostPerformer = config.performer ?? AcceptingPerformer()
        let performer: any CallKitActionPerforming = adapter.map {
            MediaRoutingPerformer(performer: hostPerformer, media: $0, uuids: uuids)
        } ?? hostPerformer
        let delegate = CallKitProviderDelegateAdapter(performer: performer, lifecycle: lifecycle,
            audio: RouteObservingAudioSession(inner: adapter ?? config.audio, routes: routes))
        provider.setDelegate(delegate, queue: nil)
        let url = config.checkpointURL ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("callx/\(config.accountGeneration)/coordinator.json")
        let coordinator = try CallCoordinator(store: CoordinatorFileStore(url: url))
        let runtime = BridgeRuntime(coordinator: coordinator, executor: executor,
            capabilities: .init(accountGeneration: config.accountGeneration, durableReplay: true,
                providerManagedSignaling: false, hold: true, mute: adapter != nil || config.audio != nil,
                video: video != nil, dtmf: dtmf != nil),
            nowMs: nowMs)
        // The ingress holds its listener weakly; this bootstrap retains the recorder.
        let recorder = PushTokenRecorder(forwardingTo: config.listener)
        let ingress = CallKitIngress(runtime: runtime, reporter: provider, uuids: uuids, lifecycle: lifecycle,
            listener: recorder, media: adapter, nowMs: nowMs)
        ingressRef.ingress = ingress
        if config.donateCalls { ingress.donateAnswered = { CallxCallRequests.donate($0) } }
        routes.onChange { current, list in
            Task {
                guard let call = await runtime.currentCall(), call.state != .ended else { return }
                _ = try? await runtime.audioRoutesObserved(callID: call.callID, current: current, routes: list)
            }
        }
        executor.setCurrentCall { await runtime.currentCall() }
        Task { @MainActor in
            CallxVideoSurfaces.install(video)
            await CallxPictureInPicture.shared.bind(to: runtime)
        }
        executor.onCameraApplied { [weak ingress] callID, on in ingress?.cameraChanged(callID: callID, on: on) }
        let probe = config.reconciliationProbe ?? UnavailableProbe(nowMs: nowMs)
        let startPush = config.startPushRegistry
        self.runtime = runtime; self.ingress = ingress; self.provider = provider; self.uuids = uuids
        self.media = status; self.delegate = delegate; self.tokenRecorder = recorder; self.routes = routes
        ready = Task {
            // New process only: persist termination and clean up CallKit before a push can ring.
            let recovered = try await ingress.recoverAfterProcessDeath()
            install(runtime)
            if startPush { ingress.startPushRegistry() }
            Task.detached { _ = try? await RecoveredOperationReconciler(coordinator: coordinator, probe: probe)
                .reconcile(nowMs: nowMs()) }
            return recovered
        }
    }

    private static func resolveMedia(_ config: CallxBootstrapConfig) throws -> ((any CallxMediaAdapter)?, CallxMediaStatus) {
        if let media = config.media {
            precondition(CallKitIngress.supports(media), "Media adapter API \(media.apiVersion) is not supported.")
            return (media, .adapter(source: "explicit"))
        }
        if config.discoverMedia {
            switch CallxMediaAdapters.discover(context: CallxAdapterContext(log: config.log)) {
            case .resolved(let adapter, let source): return (adapter, .adapter(source: source))
            case .conflict(let sources): throw CallxBootstrapError.mediaAdapterConflict(sources)
            case .unavailable(let source, let reason):
                config.log("media adapter \(source) unavailable: \(reason)")
                return (nil, config.audio == nil ? .none(reason: reason) : .hostControlled)
            case .none: break
            }
        }
        return (nil, config.audio == nil ? .none(reason: nil) : .hostControlled)
    }

    private static func defaultConfiguration(video: Bool) -> CXProviderConfiguration {
        let configuration = CXProviderConfiguration()
        configuration.supportsVideo = video
        configuration.maximumCallGroups = 1
        configuration.maximumCallsPerCallGroup = 1
        configuration.supportedHandleTypes = [.generic]
        return configuration
    }
}

/// Records the PushKit token in `CallxPushTokens` and forwards every callback to the host listener.
private final class PushTokenRecorder: CallKitIngressListener, @unchecked Sendable {
    private let host: (any CallKitIngressListener)?
    init(forwardingTo host: (any CallKitIngressListener)?) { self.host = host }
    func pushTokenUpdated(_ token: Data) { CallxPushTokens.updateVoIP(token); host?.pushTokenUpdated(token) }
    func pushTokenInvalidated() { CallxPushTokens.clear(); host?.pushTokenInvalidated() }
    func invitationAccepted(_ invitation: Invitation) { host?.invitationAccepted(invitation) }
    func invitationRejected(_ invitation: Invitation?, outcome: IncomingOutcome?) { host?.invitationRejected(invitation, outcome: outcome) }
    func ringTimedOut(callID: String) { host?.ringTimedOut(callID: callID) }
    func callAnswered(callID: String) { host?.callAnswered(callID: callID) }
    func callEnded(callID: String) { host?.callEnded(callID: callID) }
}

/// The ingress is created after the executor that renames through it.
private final class IngressReference: @unchecked Sendable {
    weak var ingress: CallKitIngress?
}

private struct AcceptingPerformer: CallKitActionPerforming {
    func perform(_ kind: CallKitActionKind, callUUID: UUID) async -> Bool { true }
    func providerDidReset() async {}
}

private struct UnavailableProbe: OperationReconciliationProbe {
    let nowMs: @Sendable () -> Int64
    func query(_ command: NativeCommand) async -> ReconciliationOutcome { .unavailable(observedAtMs: nowMs()) }
}
#endif
