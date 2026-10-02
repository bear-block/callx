import UIKit

/// Connects a CallxVideoView (Fabric or legacy) to `CallxVideoSurfaces` (ADR-0010). The
/// Objective-C++ component views own one binding each and call it on the main thread.
@MainActor
@objc(CallxVideoBinding)
public final class CallxVideoBinding: NSObject {
    private var surface: CallxVideoSurface?
    private var shown: [AnyHashable]?

    /// Attaches a surface for these props, replacing the previous one when they changed.
    @objc public func update(container: UIView, callId: String, source: String, fit: String, mirror: Bool) {
        let wanted: [AnyHashable] = [ObjectIdentifier(container), callId, source, fit, mirror]
        if wanted == shown { return }
        detach()
        guard !callId.isEmpty else { return }
        let next = CallxVideoSurface(container: container, fit: fit == "contain" ? .contain : .cover, mirror: mirror)
        surface = next; shown = wanted
        CallxVideoSurfaces.attach(callID: callId, source: source == "local" ? .local : .remote, surface: next)
    }

    @objc public func detach() {
        if let surface { CallxVideoSurfaces.detach(surface) }
        surface = nil; shown = nil
    }
}
