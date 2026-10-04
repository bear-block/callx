#if os(iOS)
import AVFAudio
import AVKit
import Foundation
import Testing
import UIKit
@testable import CallxCore

@MainActor private final class PiPDriver: CallxPiPDriving {
    var possible = true
    var automatic = false
    var starts = 0
    var invalidated = false
    var restoredSource: UIView?
    let events: (CallxPiPEvent) -> Void
    let content: AVPictureInPictureVideoCallViewController
    init(content: AVPictureInPictureVideoCallViewController, events: @escaping (CallxPiPEvent) -> Void) {
        self.content = content; self.events = events
    }
    func start() { starts += 1; events(.willStart) }
    func updateSource(_ view: UIView) { restoredSource = view }
    func invalidate() { invalidated = true }
}

private final class PiPVideoAdapter: CallxVideoAdapter, @unchecked Sendable {
    @MainActor var attached: [(VideoSource, CallxVideoSurface)] = []
    @MainActor var detached: [CallxVideoSurface] = []
    func start(callID: String, sink: any CallxMediaSink) {}
    func stop(callID: String) {}
    func setMuted(callID: String, muted: Bool) async -> Bool { true }
    func didActivate(_ session: AVAudioSession) {}
    func didDeactivate(_ session: AVAudioSession) {}
    func setCamera(callID: String, on: Bool, facing: CameraFacing) async -> CallxCameraError? { nil }
    @MainActor func attach(callID: String, source: VideoSource, surface: CallxVideoSurface) { attached.append((source, surface)) }
    @MainActor func detach(callID: String, surface: CallxVideoSurface) { detached.append(surface) }
}

private struct PiPExecutor: PlatformCommandExecutor {
    func perform(_ command: NativeCommand) async -> PlatformOutcome { .applied(completedAtMs: 1_000) }
}

@Suite(.serialized) @MainActor struct PictureInPictureTests {
    @Test func remoteLocalAndBrandingUseSeparateSurfacesAndEndedCallsReleaseThem() throws {
        let adapter = PiPVideoAdapter()
        CallxVideoSurfaces.install(adapter)
        defer { CallxVideoSurfaces.install(nil) }
        let inline = UIView(frame: CGRect(x: 0, y: 0, width: 360, height: 640))
        var driver: PiPDriver?
        let pip = CallxPictureInPicture(source: { _ in inline }, isForeground: { true }) { _, content, events in
            let next = PiPDriver(content: content, events: events); driver = next; return next
        }
        defer { pip.callChanged(nil) }
        var events: [Bool] = []
        pip.listener = { events.append($0) }
        pip.configure(automatic: true)
        var call = CallRecord(callID: "pip-1", state: .active, video: true, localVideo: .on, remoteVideo: true)
        pip.callChanged(call)
        let first = try #require(driver)
        #expect(first.automatic)
        #expect(adapter.attached.last?.0 == .remote)
        #expect(adapter.attached.last?.1.purpose == .pictureInPicture)
        #expect(adapter.attached.last?.1.container !== inline)
        #expect(pip.enter())
        #expect(first.starts == 1)
        #expect(pip.allowsBackgroundCamera)
        first.events(.didStart)
        #expect(events == [false, true])
        call.remoteVideo = false
        pip.callChanged(call)
        #expect(adapter.attached.last?.0 == .local)
        #expect(adapter.attached.last?.1.mirror == true)
        call.localVideo = .blocked
        pip.callChanged(call)
        #expect(adapter.detached.count == 2)
        pip.setFallback(backgroundColor: .purple, text: "My app")
        #expect(first.content.view.backgroundColor == .purple)
        #expect(first.content.view.subviews.compactMap { $0 as? UILabel }.first?.text == "My app")
        call.remoteVideo = true
        pip.callChanged(call)
        #expect(adapter.attached.last?.0 == .remote)
        call.state = .ended
        pip.callChanged(call)
        #expect(first.invalidated)
        #expect(adapter.detached.count == 3)
        #expect(!pip.isActive && !pip.allowsBackgroundCamera)
        #expect(events == [false, true, false])
        first.events(.didStart) // A callback from a replaced/ended controller cannot revive it.
        #expect(!pip.isActive)
        #expect(!pip.enter())
    }

    @Test func disablingAutomaticUnregistersIdleSourcesAndManualEntryStillWorks() throws {
        let inline = UIView()
        var drivers: [PiPDriver] = []
        let pip = CallxPictureInPicture(source: { _ in inline }, isForeground: { true }) { _, content, events in
            let next = PiPDriver(content: content, events: events); drivers.append(next); return next
        }
        defer { pip.callChanged(nil) }
        pip.callChanged(CallRecord(callID: "pip-2", state: .active, video: true))
        #expect(drivers.isEmpty)
        pip.configure(automatic: true)
        #expect(drivers.count == 1)
        pip.configure(automatic: false)
        #expect(drivers[0].invalidated)
        #expect(pip.enter())
        #expect(drivers.count == 2)
        #expect(!drivers[1].automatic)
        drivers[1].events(.didStart)
        drivers[1].events(.didStop)
        #expect(drivers[1].invalidated)
        #expect(!pip.isActive)
    }

    @Test func missingSourcesUnsupportedDevicesAndRingingAudioCannotStartPiP() {
        let pip = CallxPictureInPicture(source: { _ in nil }, isForeground: { true }) { _, _, _ in
            Issue.record("No controller should be created without an inline video view"); return nil
        }
        pip.configure(automatic: true)
        for state in [CallState.incoming, .outgoing, .active, .ended] {
            pip.callChanged(CallRecord(callID: "pip-3", state: state, video: state != .active))
            #expect(!pip.enter())
        }
        pip.callChanged(CallRecord(callID: "pip-3", state: .active, video: true))
        #expect(!pip.enter())
        let unsupported = CallxPictureInPicture(source: { _ in UIView() }, isForeground: { true }) { _, _, _ in nil }
        unsupported.callChanged(CallRecord(callID: "pip-4", state: .active, video: true))
        #expect(!unsupported.enter())
        unsupported.callChanged(nil)
        pip.callChanged(nil)
    }

    @Test func failedStartResetsCameraPermissionAndCanBeRetried() throws {
        var driver: PiPDriver?
        let inline = UIView()
        let pip = CallxPictureInPicture(source: { _ in inline }, isForeground: { true }) { _, content, events in
            let next = PiPDriver(content: content, events: events); driver = next; return next
        }
        defer { pip.callChanged(nil) }
        pip.callChanged(CallRecord(callID: "pip-5", state: .active, video: true))
        #expect(pip.enter())
        let first = try #require(driver)
        first.events(.failed(NSError(domain: "pip-tests", code: 1)))
        #expect(first.invalidated)
        #expect(!pip.allowsBackgroundCamera)
        #expect(pip.enter())
        #expect(driver !== first)
    }

    @Test func restoreAcknowledgesHostNavigationAndUnavailableStartIsFalse() throws {
        var driver: PiPDriver?
        let inline = UIView()
        var foreground = true
        let pip = CallxPictureInPicture(source: { _ in inline }, isForeground: { foreground }) { _, content, events in
            let next = PiPDriver(content: content, events: events); driver = next; return next
        }
        defer { pip.callChanged(nil) }
        pip.configure(automatic: true)
        pip.callChanged(CallRecord(callID: "pip-6", state: .held, video: true))
        let first = try #require(driver)
        first.possible = false
        #expect(!pip.enter())
        first.possible = true; foreground = false
        #expect(!pip.enter())
        foreground = true
        #expect(pip.enter())
        first.events(.didStart)
        var restored = false
        pip.restoreUserInterface = { completion in completion(true) }
        first.events(.restore { restored = $0 })
        #expect(restored)
        // Restoring the UI is not itself a system stop event.
        #expect(pip.isActive)
        first.events(.didStop)
        #expect(!pip.isActive)
    }

    @Test func delayedNativeSnapshotsCannotReviveAnEndedCall() {
        var creations = 0
        let inline = UIView()
        let pip = CallxPictureInPicture(source: { _ in inline }) { _, content, events in
            creations += 1; return PiPDriver(content: content, events: events)
        }
        pip.configure(automatic: true)
        pip.callChanged(CallRecord(callID: "pip-7", state: .active, video: true), sequence: 10)
        pip.callChanged(CallRecord(callID: "pip-7", state: .ended, video: true), sequence: 12)
        pip.callChanged(CallRecord(callID: "pip-7", state: .active, video: true), sequence: 11)
        #expect(creations == 1)
        #expect(!pip.enter())
        pip.callChanged(nil)
    }

    @Test func frameworkRestoreWaitsForTheNewInlineView() throws {
        var inline: UIView? = UIView()
        var driver: PiPDriver?
        let pip = CallxPictureInPicture(source: { _ in inline }, isForeground: { true }) { _, content, events in
            let next = PiPDriver(content: content, events: events); driver = next; return next
        }
        defer { pip.callChanged(nil) }
        pip.callChanged(CallRecord(callID: "pip-8", state: .active, video: true))
        #expect(pip.enter())
        let first = try #require(driver)
        first.events(.didStart)
        inline = nil // The framework is still showing its compact layout.
        var restored: [Bool] = []
        first.events(.restore { restored.append($0) })
        #expect(restored.isEmpty)
        let next = UIView(); inline = next
        pip.refreshSource()
        #expect(restored == [true])
        #expect(first.restoredSource === next)
    }

    @Test func manualHostsCanBindAndDetachWithoutOpeningAFrameworkSession() async throws {
        let runtime = BridgeRuntime(coordinator: CallCoordinator(), executor: PiPExecutor(), capabilities:
            .init(accountGeneration: "pip-host", durableReplay: true, providerManagedSignaling: false,
                hold: true, mute: true, video: true), nowMs: { 1_000 })
        try await runtime.reportIncoming(callID: "pip-host-1", displayName: "Steven", handle: "steven", video: true)
        _ = try await runtime.platformAnswered(callID: "pip-host-1")
        let inline = UIView()
        var driver: PiPDriver?
        let pip = CallxPictureInPicture(source: { _ in inline }, isForeground: { true }) { _, content, events in
            let next = PiPDriver(content: content, events: events); driver = next; return next
        }
        pip.configure(automatic: true)
        await pip.bind(to: runtime)
        for _ in 0..<20 { await Task.yield() }
        #expect(pip.callID == "pip-host-1")
        #expect(pip.enter())
        let first = try #require(driver)
        await pip.bind(to: nil)
        #expect(first.invalidated)
        #expect(pip.callID == nil)
        _ = try await runtime.remoteEnded(callID: "pip-host-1")
        for _ in 0..<20 { await Task.yield() }
        #expect(pip.callID == nil && !pip.enter())
    }
}
#endif
