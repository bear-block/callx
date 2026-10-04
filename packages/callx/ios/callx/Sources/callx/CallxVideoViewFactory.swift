@preconcurrency import Flutter
import UIKit

/// `CallxVideoView` for Flutter (ADR-0010): a container the video adapter renders into.
/// Parameters are fixed per view; the Dart widget recreates the view when they change.
final class CallxVideoViewFactory: NSObject, FlutterPlatformViewFactory {
    func create(withFrame frame: CGRect, viewIdentifier viewId: Int64, arguments args: Any?) -> any FlutterPlatformView {
        CallxVideoPlatformView(frame: frame, params: args as? [String: Any] ?? [:])
    }
    func createArgsCodec() -> any FlutterMessageCodec & NSObjectProtocol { FlutterStandardMessageCodec.sharedInstance() }
}

private final class CallxVideoPlatformView: NSObject, FlutterPlatformView {
    private let container: UIView
    private let surface: CallxVideoSurface

    init(frame: CGRect, params: [String: Any]) {
        container = CallxInlineVideoContainer(frame: frame)
        container.clipsToBounds = true
        surface = CallxVideoSurface(container: container, fit: params["fit"] as? String == "contain" ? .contain : .cover,
            mirror: params["mirror"] as? Bool ?? false)
        super.init()
        if let callID = params["callId"] as? String, !callID.isEmpty {
            let source: VideoSource = params["source"] as? String == "local" ? .local : .remote
            let surface = surface
            // Flutter creates platform views on the main thread.
            MainActor.assumeIsolated { CallxVideoSurfaces.attach(callID: callID, source: source, surface: surface) }
        }
    }

    func view() -> UIView { container }

    deinit {
        let surface = surface
        Task { @MainActor in CallxVideoSurfaces.detach(surface) }
    }
}

private final class CallxInlineVideoContainer: UIView {
    override func didMoveToWindow() {
        super.didMoveToWindow()
        CallxVideoSurfaces.sourceViewDidChange()
    }
    override func layoutSubviews() {
        super.layoutSubviews()
        CallxVideoSurfaces.sourceViewDidChange()
    }
}
