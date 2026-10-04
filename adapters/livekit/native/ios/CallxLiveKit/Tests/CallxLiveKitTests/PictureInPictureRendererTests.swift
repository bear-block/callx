#if os(iOS)
import CallxCore
import LiveKit
import Testing
import UIKit
@testable import CallxLiveKit

@Test @MainActor func pictureInPictureUsesSampleBuffersWithoutChangingInlineRendering() {
    let container = UIView(frame: CGRect(x: 0, y: 0, width: 360, height: 640))
    let inline = LiveKitMediaAdapter.makeRenderer(for: CallxVideoSurface(container: container))
    let pip = LiveKitMediaAdapter.makeRenderer(for: CallxVideoSurface(container: container,
        fit: .contain, mirror: true, purpose: .pictureInPicture))
    #expect(inline.renderMode == .auto)
    #expect(pip.renderMode == .sampleBuffer)
    #expect(pip.layoutMode == .fit)
    #expect(pip.mirrorMode == .mirror)
    #expect(pip.frame == container.bounds)
}
#endif
