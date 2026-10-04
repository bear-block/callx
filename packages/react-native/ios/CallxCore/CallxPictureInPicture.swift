#if os(iOS)
import AVKit
import UIKit

/// Native video-call PiP. Window state stays outside the call contract (ADR-0010).
/// The host keeps an inline CallxVideoView mounted; PiP attaches its own adapter surface.
@MainActor
public final class CallxPictureInPicture {
    public static let shared = CallxPictureInPicture()
    /// Adapters observe this to pause/resume capture when PiP starts or stops in the background.
    nonisolated public static let cameraAvailabilityDidChange = Notification.Name("dev.callx.pip.cameraAvailability")
    public var listener: ((Bool) -> Void)? { didSet { listener?(isActive) } }
    public var onError: ((Error) -> Void)?
    /// Native hosts can restore their own navigation before acknowledging the system request.
    public var restoreUserInterface: ((@escaping (Bool) -> Void) -> Void)?
    public private(set) var isActive = false
    public var allowsBackgroundCamera: Bool { isActive || starting }
    public var callID: String? { call?.callID }

    private var automatic = false
    private var generation = 0
    private var starting = false
    private var call: CallRecord?
    private var lastSequence: UInt64?
    private var runtime: BridgeRuntime?
    private var observerID: UUID?
    private var bindingGeneration = 0
    private var driver: (any CallxPiPDriving)?
    private var content: AVPictureInPictureVideoCallViewController?
    private var surface: CallxVideoSurface?
    private var selectedSource: VideoSource?
    private weak var sourceView: UIView?
    private var pendingRestore: ((Bool) -> Void)?
    private let source: (String) -> UIView?
    private let isForeground: () -> Bool
    private let makeDriver: (UIView, AVPictureInPictureVideoCallViewController, @escaping (CallxPiPEvent) -> Void) -> (any CallxPiPDriving)?
    private let fallback = UILabel()
    private let logo = UIImageView()
    private var backgroundColor = UIColor.systemBackground

    private convenience init() {
        self.init(source: { CallxVideoSurfaces.pictureInPictureSource(callID: $0) }, makeDriver: { view, content, events in
            guard AVPictureInPictureController.isPictureInPictureSupported() else { return nil }
            return SystemCallxPiPDriver(source: view, content: content, events: events)
        })
    }

    // Inject only the OS driver in tests; call, source selection and surface cleanup stay real.
    init(source: @escaping (String) -> UIView?,
        isForeground: @escaping () -> Bool = { UIApplication.shared.applicationState == .active },
        makeDriver: @escaping (UIView, AVPictureInPictureVideoCallViewController, @escaping (CallxPiPEvent) -> Void) -> (any CallxPiPDriving)?) {
        self.source = source; self.makeDriver = makeDriver; self.isForeground = isForeground
        fallback.text = Bundle.main.object(forInfoDictionaryKey: "CFBundleDisplayName") as? String ?? "Call"
        fallback.textAlignment = .center
        fallback.textColor = .label
        fallback.font = .preferredFont(forTextStyle: .title2)
        fallback.adjustsFontSizeToFitWidth = true
        logo.contentMode = .scaleAspectFit
    }

    /// Bootstrap calls this automatically. Native/manual hosts bind their runtime here;
    /// bind nil on teardown. Replacing it discards callbacks from the previous account/runtime.
    public func bind(to runtime: BridgeRuntime?) async {
        if self.runtime === runtime { return }
        bindingGeneration += 1
        let binding = bindingGeneration
        let previous = self.runtime, oldObserver = observerID
        self.runtime = runtime; observerID = nil
        clear(); call = nil; lastSequence = nil
        if let previous, let oldObserver { await previous.removeCallObserver(oldObserver) }
        guard binding == bindingGeneration, let runtime else { return }
        let id = await runtime.addCallObserver { [weak self] call, sequence in
            Task { @MainActor [weak self] in
                guard let self, self.bindingGeneration == binding else { return }
                self.callChanged(call, sequence: sequence)
            }
        }
        if binding == bindingGeneration { observerID = id }
        else { await runtime.removeCallObserver(id) }
    }

    /// Configure before leaving the app. With automatic=false no idle fullscreen source is
    /// registered with AVKit, because fullscreen sources can otherwise auto-enter by default.
    public func configure(automatic: Bool) {
        self.automatic = automatic
        if !automatic && !isActive && !starting { clear() }
        else { refreshSource() }
        driver?.automatic = automatic
    }

    /// A native host's app branding, shown when neither remote nor local video is available.
    public func setFallback(backgroundColor: UIColor, image: UIImage? = nil, text: String? = nil) {
        self.backgroundColor = backgroundColor
        logo.image = image
        if let text { fallback.text = text }
        content?.view.backgroundColor = backgroundColor
        logo.isHidden = image == nil
        fallback.isHidden = image != nil
    }

    /// True means AVKit accepted a start request; the listener confirms actual entry.
    /// Unsupported devices, missing inline views and calls that are not live return false.
    @discardableResult public func enter() -> Bool {
        guard isForeground(), liveCall else { return false }
        refreshSource(manual: true)
        guard let driver, driver.possible else {
            if !automatic { clear() }
            return false
        }
        if isActive || starting { return true }
        starting = true
        notifyCamera()
        driver.start()
        return true
    }

    func callChanged(_ call: CallRecord?, sequence: UInt64? = nil) {
        if let sequence {
            if let lastSequence, sequence <= lastSequence { return }
            lastSequence = sequence
        }
        if self.call?.callID != call?.callID { clear() }
        self.call = call
        guard liveCall else { clear(); return }
        refreshSource()
    }

    private var liveCall: Bool {
        guard let call else { return false }
        return [.connecting, .active, .held].contains(call.state) &&
            (call.video || call.remoteVideo || call.localVideo != .off)
    }

    public func refreshSource() { refreshSource(manual: false) }

    private func refreshSource(manual: Bool) {
        guard liveCall, let call else { clear(); return }
        // A framework may replace its inline view while PiP is active. Keep the existing
        // controller and native surface alive until the system completes the stop animation.
        if isActive || starting { updateSurface(); finishRestoreIfPossible(); return }
        guard automatic || manual else { return }
        guard let next = source(call.callID) else { clear(); return }
        if sourceView !== next || driver == nil {
            clear()
            let content = AVPictureInPictureVideoCallViewController()
            content.preferredContentSize = CGSize(width: 360, height: 640)
            content.view.frame = CGRect(origin: .zero, size: content.preferredContentSize)
            content.view.backgroundColor = backgroundColor
            fallback.frame = content.view.bounds.insetBy(dx: 16, dy: 16)
            fallback.autoresizingMask = [.flexibleWidth, .flexibleHeight]
            logo.frame = content.view.bounds.insetBy(dx: 48, dy: 48)
            logo.autoresizingMask = [.flexibleWidth, .flexibleHeight]
            logo.isHidden = logo.image == nil
            fallback.isHidden = logo.image != nil
            content.view.addSubview(fallback)
            content.view.addSubview(logo)
            let generation = self.generation
            guard let driver = makeDriver(next, content, { [weak self] event in
                guard let self, self.generation == generation else { return }
                self.handle(event)
            }) else { return }
            self.content = content
            self.driver = driver
            self.sourceView = next
            driver.automatic = automatic
        }
        updateSurface()
    }

    private func updateSurface() {
        guard let call, let content else { return }
        let wanted: VideoSource? = call.remoteVideo ? .remote : (call.localVideo == .on ? .local : nil)
        let mirror = wanted == .local && call.cameraFacing != .back
        guard wanted != selectedSource || (surface != nil && surface?.mirror != mirror) else { return }
        detachSurface()
        selectedSource = wanted
        guard let wanted else { return }
        let container = UIView(frame: content.view.bounds)
        container.clipsToBounds = true
        container.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        content.view.addSubview(container)
        let surface = CallxVideoSurface(container: container, mirror: mirror, purpose: .pictureInPicture)
        self.surface = surface
        CallxVideoSurfaces.attach(callID: call.callID, source: wanted, surface: surface)
    }

    private func detachSurface() {
        if let surface {
            CallxVideoSurfaces.detach(surface)
            surface.container.removeFromSuperview()
        }
        surface = nil; selectedSource = nil
    }

    private func clear() {
        // Clear contentSource as well as stopping, so ended calls cannot auto-start PiP.
        let old = driver
        generation += 1
        let wasPresenting = old != nil || starting || isActive
        driver = nil
        pendingRestore?(false); pendingRestore = nil
        old?.invalidate()
        detachSurface()
        content = nil; sourceView = nil
        starting = false
        if isActive { isActive = false; listener?(false) }
        if wasPresenting { notifyCamera() }
    }

    private func notifyCamera() {
        NotificationCenter.default.post(name: Self.cameraAvailabilityDidChange, object: self)
    }

    private func finishRestoreIfPossible() {
        guard let completion = pendingRestore, let call, let view = source(call.callID) else { return }
        driver?.updateSource(view)
        sourceView = view
        pendingRestore = nil
        completion(true)
    }

    private func handle(_ event: CallxPiPEvent) {
        switch event {
        case .willStart:
            starting = true; notifyCamera()
        case .didStart:
            starting = false; isActive = true; notifyCamera(); listener?(true)
        case .didStop:
            starting = false; isActive = false; notifyCamera(); listener?(false)
            if !automatic { clear() } else { refreshSource() }
        case .failed(let error):
            clear(); onError?(error)
        case .restore(let completion):
            // Framework listeners restore the full app layout; native hosts may navigate too.
            listener?(false)
            if let restoreUserInterface { restoreUserInterface(completion) }
            else {
                pendingRestore?(false)
                pendingRestore = completion
                finishRestoreIfPossible()
                let generation = self.generation
                // Dart/React may mount the restored inline view after receiving the event.
                Task { @MainActor [weak self] in
                    try? await Task.sleep(nanoseconds: 2_000_000_000)
                    guard let self, self.generation == generation else { return }
                    self.pendingRestore?(false); self.pendingRestore = nil
                }
            }
        }
    }
}

@MainActor
protocol CallxPiPDriving: AnyObject {
    var possible: Bool { get }
    var automatic: Bool { get set }
    func start()
    func updateSource(_ view: UIView)
    func invalidate()
}

enum CallxPiPEvent {
    case willStart, didStart, didStop
    case failed(Error)
    case restore((Bool) -> Void)
}

@MainActor
private final class SystemCallxPiPDriver: NSObject, CallxPiPDriving, @preconcurrency AVPictureInPictureControllerDelegate {
    private let controller: AVPictureInPictureController
    private let events: (CallxPiPEvent) -> Void
    private let content: AVPictureInPictureVideoCallViewController
    var possible: Bool { controller.isPictureInPicturePossible }
    var automatic: Bool {
        get { controller.canStartPictureInPictureAutomaticallyFromInline }
        set { controller.canStartPictureInPictureAutomaticallyFromInline = newValue }
    }
    init(source: UIView, content: AVPictureInPictureVideoCallViewController, events: @escaping (CallxPiPEvent) -> Void) {
        controller = AVPictureInPictureController(contentSource: .init(activeVideoCallSourceView: source, contentViewController: content))
        self.events = events
        self.content = content
        super.init()
        controller.delegate = self
    }
    func start() { controller.startPictureInPicture() }
    func updateSource(_ view: UIView) {
        controller.contentSource = .init(activeVideoCallSourceView: view, contentViewController: content)
    }
    func invalidate() {
        controller.delegate = nil
        controller.canStartPictureInPictureAutomaticallyFromInline = false
        controller.stopPictureInPicture()
        controller.contentSource = nil
    }
    func pictureInPictureControllerWillStartPictureInPicture(_ controller: AVPictureInPictureController) { events(.willStart) }
    func pictureInPictureControllerDidStartPictureInPicture(_ controller: AVPictureInPictureController) { events(.didStart) }
    func pictureInPictureControllerDidStopPictureInPicture(_ controller: AVPictureInPictureController) { events(.didStop) }
    func pictureInPictureController(_ controller: AVPictureInPictureController, failedToStartPictureInPictureWithError error: Error) {
        events(.failed(error))
    }
    func pictureInPictureController(_ controller: AVPictureInPictureController,
        restoreUserInterfaceForPictureInPictureStopWithCompletionHandler completionHandler: @escaping (Bool) -> Void) {
        events(.restore(completionHandler))
    }
}
#endif
