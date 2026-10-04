#if os(iOS)
import UIKit

/// Connects framework video views to the video media adapter (ADR-0010). `CallxVideoView`
/// attaches its surface when it mounts and detaches it when it unmounts; the adapter renders into
/// it once the source exists. Without a video adapter, views stay empty.
@MainActor
public enum CallxVideoSurfaces {
    private static var adapter: (any CallxVideoAdapter)?
    private static var mounted: [ObjectIdentifier: (surface: CallxVideoSurface, callID: String, source: VideoSource)] = [:]

    /// `CallxBootstrap` installs the discovered adapter; hosts that bootstrap natively call this.
    public static func install(_ adapter: (any CallxVideoAdapter)?) {
        if adapter === self.adapter { return }
        for item in mounted.values { self.adapter?.detach(callID: item.callID, surface: item.surface) }
        self.adapter = adapter
        for item in mounted.values { adapter?.attach(callID: item.callID, source: item.source, surface: item.surface) }
        sourceViewDidChange()
    }

    /// Shows `source` of `callID` in `surface`, replacing what it showed before.
    public static func attach(callID: String, source: VideoSource, surface: CallxVideoSurface) {
        let key = ObjectIdentifier(surface)
        if let current = mounted[key], current.callID == callID, current.source == source { return }
        detach(surface)
        mounted[key] = (surface, callID, source)
        adapter?.attach(callID: callID, source: source, surface: surface)
        if surface.purpose == .inline { sourceViewDidChange() }
    }

    public static func detach(_ surface: CallxVideoSurface) {
        guard let item = mounted.removeValue(forKey: ObjectIdentifier(surface)) else { return }
        adapter?.detach(callID: item.callID, surface: surface)
        if surface.purpose == .inline { sourceViewDidChange() }
    }

    /// Call after a framework view mounts, lays out or moves between windows.
    public static func sourceViewDidChange() {
        // Layout/window attachment may finish after the props arrive.
        Task { @MainActor in CallxPictureInPicture.shared.refreshSource() }
    }

    static func pictureInPictureSource(callID: String) -> UIView? {
        let candidates = mounted.values.filter {
            $0.callID == callID && $0.surface.purpose == .inline &&
            $0.surface.container.window != nil && !$0.surface.container.isHidden &&
            $0.surface.container.bounds.width > 0 && $0.surface.container.bounds.height > 0
        }
        return (candidates.first { $0.source == .remote } ?? candidates.first)?.surface.container
    }
}
#endif
