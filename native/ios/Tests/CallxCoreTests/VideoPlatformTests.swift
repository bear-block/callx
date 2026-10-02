#if os(iOS)
import AVFAudio
import CallKit
import Foundation
import Testing
@testable import CallxCore

// ADR-0010 on iOS: video invitations report hasVideo, camera commands reach a video adapter.

private final class VideoReporter: CallKitIncomingReporting, @unchecked Sendable {
    private let lock = NSLock()
    private var _reported: [CXCallUpdate] = []
    private var _updated: [Bool] = []
    var reported: [CXCallUpdate] { lock.withLock { _reported } }
    var updated: [Bool] { lock.withLock { _updated } }
    func reportNewIncomingCall(with uuid: UUID, update: CXCallUpdate) async throws { lock.withLock { _reported.append(update) } }
    func reportCall(with uuid: UUID, endedAt: Date?, reason: CXCallEndedReason) {}
    func reportOutgoingCall(with uuid: UUID, connectedAt: Date?) {}
    func reportCall(with uuid: UUID, updated update: CXCallUpdate) { lock.withLock { _updated.append(update.hasVideo) } }
}

private final class FakeVideoAdapter: CallxVideoAdapter, @unchecked Sendable {
    private let lock = NSLock()
    private var _camera: [String] = []
    var camera: [String] { lock.withLock { _camera } }
    var error: CallxCameraError?
    func start(callID: String, sink: any CallxMediaSink) {}
    func stop(callID: String) {}
    func setMuted(callID: String, muted: Bool) async -> Bool { true }
    func didActivate(_ session: AVAudioSession) {}
    func didDeactivate(_ session: AVAudioSession) {}
    func setCamera(callID: String, on: Bool, facing: CameraFacing) async -> CallxCameraError? {
        lock.withLock { _camera.append("\(on):\(facing.rawValue)") }; return error
    }
    func attach(callID: String, source: VideoSource, surface: CallxVideoSurface) {}
    func detach(callID: String, surface: CallxVideoSurface) {}
}

private struct Applied: PlatformCommandExecutor {
    func perform(_ command: NativeCommand) async -> PlatformOutcome { .applied(completedAtMs: 1) }
}

private final class Foreground: @unchecked Sendable { var value = true }

private func harness(adapter: (any CallxVideoAdapter)?, foreground: Foreground = Foreground())
    async throws -> (BridgeRuntime, CallxCameraExecutor, [Bool]) {
    let executor = CallxCameraExecutor(inner: Applied(), video: adapter, nowMs: { 1 }, isForeground: { foreground.value })
    let runtime = BridgeRuntime(coordinator: CallCoordinator(), executor: executor, capabilities:
        BridgeCapabilities(accountGeneration: "generation-1", durableReplay: true, providerManagedSignaling: false,
            hold: true, mute: true, video: adapter != nil), nowMs: { 1_000 })
    executor.setCurrentCall { await runtime.currentCall() }
    try await runtime.reportIncoming(callID: "call-1", displayName: "A", handle: "h", video: true)
    _ = try await runtime.execute(["contractVersion": .string("0.2.0"), "operationId": .string("answer"),
        "type": .string("answer"), "callId": .string("call-1")])
    return (runtime, executor, [])
}

private func command(_ runtime: BridgeRuntime, _ type: String, _ value: BridgeValue) async throws -> BridgeObject {
    try await runtime.execute(["contractVersion": .string("0.2.0"), "operationId": .string("\(type)-\(UUID())"),
        "type": .string(type), "callId": .string("call-1"), "value": value])
}
private func errorCode(_ result: BridgeObject) -> String? {
    if case .object(let error) = result["error"], case .string(let code) = error["code"] { return code }
    return nil
}

@Test func aVideoInvitationIsReportedToCallKitWithVideo() async throws {
    let reporter = VideoReporter()
    let runtime = BridgeRuntime(coordinator: CallCoordinator(), executor: Applied(), capabilities:
        BridgeCapabilities(accountGeneration: "g", durableReplay: true, providerManagedSignaling: false, hold: true, mute: true),
        nowMs: { 1_000 })
    let ingress = CallKitIngress(runtime: runtime, reporter: reporter, uuids: CallUUIDMap(), nowMs: { 1_000 })
    await ingress.handleInvitation(Invitation(callID: "call-1", displayName: "A", handle: "h", video: true))
    #expect(reporter.reported.first?.hasVideo == true)
    #expect(await runtime.currentCall()?.video == true)
    ingress.cameraChanged(callID: "call-1", on: true)
    #expect(reporter.updated == [true])
}

@Test func cameraCommandsReachTheVideoAdapterWithTheChosenCamera() async throws {
    let adapter = FakeVideoAdapter()
    let (runtime, executor, _) = try await harness(adapter: adapter)
    let applied = AppliedLog()
    executor.onCameraApplied { callID, on in applied.append("\(callID):\(on)") }
    #expect(try await command(runtime, "switchCamera", .string("back"))["status"] == .string("applied"))
    #expect(adapter.camera.isEmpty)
    #expect(try await command(runtime, "setCamera", .bool(true))["status"] == .string("applied"))
    #expect(adapter.camera == ["true:back"])
    #expect(await runtime.currentCall()?.localVideo == .on)
    _ = try await command(runtime, "switchCamera", .string("front"))
    #expect(adapter.camera.last == "true:front")
    _ = try await command(runtime, "setCamera", .bool(false))
    #expect(adapter.camera.last == "false:front")
    #expect(applied.values == ["call-1:true", "call-1:true", "call-1:false"])
}

@Test func theCameraNeedsTheForegroundAndThePermission() async throws {
    let adapter = FakeVideoAdapter(); let foreground = Foreground(); foreground.value = false
    let (runtime, _, _) = try await harness(adapter: adapter, foreground: foreground)
    #expect(errorCode(try await command(runtime, "setCamera", .bool(true))) == "mediaNotReady")
    #expect(adapter.camera.isEmpty)
    foreground.value = true; adapter.error = .permissionDenied
    #expect(errorCode(try await command(runtime, "setCamera", .bool(true))) == "permissionDenied")
    #expect(await runtime.currentCall()?.localVideo == .off)
}

@Test func withoutAVideoAdapterCameraCommandsAreUnsupported() async throws {
    let (runtime, _, _) = try await harness(adapter: nil)
    #expect(errorCode(try await command(runtime, "setCamera", .bool(true))) == "unsupported")
}

@Test func onlyVersionTwoAdaptersThatCarryVideoAreAccepted() {
    #expect(callxSupportsMediaAdapter(FakeVideoAdapter()))
}

private final class AppliedLog: @unchecked Sendable {
    private let lock = NSLock(); private var _values: [String] = []
    var values: [String] { lock.withLock { _values } }
    func append(_ value: String) { lock.withLock { _values.append(value) } }
}
#endif
