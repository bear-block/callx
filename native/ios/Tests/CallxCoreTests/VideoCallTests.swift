import Testing
import Foundation
@testable import CallxCore

// ADR-0010: video is a property of the call, camera control is a command, the rest is observed.

private func answered(_ core: CallCoordinator = CallCoordinator()) async -> CallCoordinator {
    await core.reportIncoming(callID: "call-1", displayName: "hao.dev7", handle: "+84901", nowMs: 900, video: true)
    _ = await core.prepare(NativeCommand(operationID: "answer", type: .answer, callID: "call-1", deadlineAtMs: 5_000), nowMs: 1_000)
    await core.completeApplied(operationID: "answer", nowMs: 1_000)
    return core
}

@discardableResult
private func camera(_ core: CallCoordinator, _ id: String, _ on: Bool, at: Int64) async -> NativeOperation? {
    let command = NativeCommand(operationID: id, type: .setCamera, callID: "call-1", value: on, deadlineAtMs: at + 4_000)
    if case .existing(let operation) = await core.prepare(command, nowMs: at) { return operation }
    return await core.completeApplied(operationID: id, nowMs: at + 10)
}

@Test func videoIsAPropertyOfTheCallNotAState() async {
    let core = await answered()
    #expect(await core.snapshot()?.video == true)
    #expect(await core.videoObserved(callID: "call-1", localVideo: nil, remoteVideo: true, nowMs: 1_050))
    #expect(await core.snapshot()?.state == .connecting)
    await core.mediaConnected(callID: "call-1", nowMs: 1_100)
    #expect(await core.snapshot()?.state == .active)
    #expect(await core.snapshot()?.remoteVideo == true)
}

@Test func cameraOnAndOffAreCommandsCommittedOnlyWhenApplied() async {
    let core = await answered()
    let on = NativeCommand(operationID: "cam-on", type: .setCamera, callID: "call-1", value: true, deadlineAtMs: 5_000)
    #expect(await core.prepare(on, nowMs: 1_100) == .execute)
    #expect(await core.snapshot()?.localVideo == .off)
    await core.completeApplied(operationID: "cam-on", nowMs: 1_200)
    #expect(await core.snapshot()?.localVideo == .on)
    #expect(await core.snapshot()?.cameraFacing == .front)
    #expect(await camera(core, "cam-off", false, at: 1_300)?.status == .applied)
    #expect(await core.snapshot()?.localVideo == .off)
    _ = await core.prepare(NativeCommand(operationID: "denied", type: .setCamera, callID: "call-1", value: true,
        deadlineAtMs: 5_000), nowMs: 1_400)
    await core.completeRejected(operationID: "denied", errorCode: "permissionDenied", nowMs: 1_410)
    #expect(await core.snapshot()?.localVideo == .off)
}

@Test func cameraCommandsNeedALiveAnsweredCall() async {
    let core = CallCoordinator()
    await core.reportIncoming(callID: "call-1", displayName: "hao.dev7", handle: "+84901", nowMs: 900, video: true)
    #expect(await camera(core, "ringing", true, at: 1_000)?.errorCode == "invalidState")
    let noValue = await core.prepare(NativeCommand(operationID: "no-value", type: .setCamera, callID: "call-1",
        deadlineAtMs: 5_000), nowMs: 1_000)
    #expect(noValue == .existing(NativeOperation(operationID: "no-value", status: .rejected,
        errorCode: "invalidArgument", completedAtMs: 1_000)))
    let noFacing = await core.prepare(NativeCommand(operationID: "no-facing", type: .switchCamera, callID: "call-1",
        deadlineAtMs: 5_000), nowMs: 1_000)
    #expect(noFacing == .existing(NativeOperation(operationID: "no-facing", status: .rejected,
        errorCode: "invalidArgument", completedAtMs: 1_000)))
}

@Test func switchingTheCameraIsRememberedEvenWhileItIsOff() async {
    let core = await answered()
    _ = await core.prepare(NativeCommand(operationID: "back", type: .switchCamera, callID: "call-1", deadlineAtMs: 5_000,
        facing: .back), nowMs: 1_100)
    await core.completeApplied(operationID: "back", nowMs: 1_110)
    #expect(await core.snapshot()?.cameraFacing == .back)
    #expect(await core.snapshot()?.localVideo == .off)
    await camera(core, "cam-on", true, at: 1_200)
    #expect(await core.snapshot()?.cameraFacing == .back)
}

@Test func theAdapterCanOnlyReportTheCameraTakenOrGivenBack() async {
    let core = await answered()
    #expect(await core.videoObserved(callID: "call-1", localVideo: .on, remoteVideo: nil, nowMs: 1_050) == false)
    #expect(await core.videoObserved(callID: "call-1", localVideo: .blocked, remoteVideo: nil, nowMs: 1_060) == false)
    await camera(core, "cam-on", true, at: 1_100)
    #expect(await core.videoObserved(callID: "call-1", localVideo: .blocked, remoteVideo: nil, nowMs: 1_200))
    #expect(await core.snapshot()?.localVideo == .blocked)
    #expect(await core.videoObserved(callID: "call-1", localVideo: .on, remoteVideo: nil, nowMs: 1_300))
    await core.videoObserved(callID: "call-1", localVideo: .blocked, remoteVideo: nil, nowMs: 1_400)
    await camera(core, "cam-off", false, at: 1_500)
    #expect(await core.snapshot()?.localVideo == .off)
    #expect(await core.videoObserved(callID: "call-1", localVideo: .on, remoteVideo: nil, nowMs: 1_600) == false)
}

@Test func endingTheCallResetsVideoButKeepsWhatItWas() async {
    let core = await answered()
    await camera(core, "cam-on", true, at: 1_100)
    await core.videoObserved(callID: "call-1", localVideo: nil, remoteVideo: true, nowMs: 1_150)
    await core.remoteEnded(callID: "call-1", nowMs: 1_200)
    let ended = await core.snapshot()
    #expect(ended?.video == true)
    #expect(ended?.localVideo == .off)
    #expect(ended?.remoteVideo == false)
}

@Test func videoStateSurvivesTheCheckpoint() async throws {
    let core = await answered()
    _ = await core.prepare(NativeCommand(operationID: "back", type: .switchCamera, callID: "call-1", deadlineAtMs: 5_000,
        facing: .back), nowMs: 1_100)
    await core.completeApplied(operationID: "back", nowMs: 1_110)
    let pending = NativeCommand(operationID: "cam-on", type: .setCamera, callID: "call-1", value: true, deadlineAtMs: 5_000)
    _ = await core.prepare(pending, nowMs: 1_200)
    await core.videoObserved(callID: "call-1", localVideo: nil, remoteVideo: true, nowMs: 1_250)
    let directory = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: directory) }
    let store = CoordinatorFileStore(url: directory.appending(path: "coordinator.json"))
    try store.save(await core.checkpoint())
    let restored = CallCoordinator(checkpoint: try #require(try store.load()))
    #expect(await restored.snapshot() == core.snapshot())
    #expect(await restored.pendingCommands() == [pending])
    await restored.completeApplied(operationID: "cam-on", nowMs: 1_300)
    #expect(await restored.snapshot()?.localVideo == .on)
    #expect(await restored.snapshot()?.cameraFacing == .back)
}

@Test func checkpointsWrittenBeforeVideoStillDecode() throws {
    let json = #"{"callID":"call-1","state":"active","muted":false,"mediaReady":true,"direction":"incoming","displayName":"A"}"#
    let record = try JSONDecoder().decode(CallRecord.self, from: Data(json.utf8))
    #expect(record.video == false)
    #expect(record.localVideo == .off)
    #expect(record.cameraFacing == nil)
    #expect(record.remoteVideo == false)
    let command = try JSONDecoder().decode(NativeCommand.self, from: Data(
        #"{"operationID":"op","type":"setMuted","callID":"call-1","value":true,"deadlineAtMs":1}"#.utf8))
    #expect(command.video == false)
    #expect(command.facing == nil)
}

private struct AppliedVideoExecutor: PlatformCommandExecutor {
    func perform(_ command: NativeCommand) async -> PlatformOutcome { .applied(completedAtMs: 1_100) }
}

@Test func theBridgeCarriesVideoFieldsOnlyWhenTheyAreSet() async throws {
    let bridge = BridgeRuntime(coordinator: CallCoordinator(), executor: AppliedVideoExecutor(), capabilities:
        BridgeCapabilities(accountGeneration: "generation-1", durableReplay: true, providerManagedSignaling: false,
            hold: true, mute: true, video: true), nowMs: { 1_000 })
    #expect(try await bridge.setup(["contractVersion": .string("0.2.0")])["video"] == .bool(true))
    #expect(try await bridge.setup(["contractVersion": .string("0.1.0")])["contractVersion"] == .string("0.2.0"))
    _ = try await bridge.execute(["contractVersion": .string("0.2.0"), "operationId": .string("start"),
        "type": .string("startCall"), "input": .object(["callId": .string("call-1"), "displayName": .string("hao.dev7"),
            "handle": .string("sip:a@example.invalid"), "video": .bool(true)])])
    guard case .object(var call) = try await bridge.getSnapshot()["call"] else { Issue.record("no call"); return }
    #expect(call["video"] == .bool(true))
    #expect(call["localVideo"] == nil)
    #expect(call["remoteVideo"] == nil)
    try await bridge.remoteAnswered(callID: "call-1")
    let switched = try await bridge.execute(["contractVersion": .string("0.2.0"), "operationId": .string("back"),
        "type": .string("switchCamera"), "callId": .string("call-1"), "value": .string("back")])
    #expect(switched["status"] == .string("applied"))
    _ = try await bridge.execute(["contractVersion": .string("0.2.0"), "operationId": .string("cam"),
        "type": .string("setCamera"), "callId": .string("call-1"), "value": .bool(true)])
    try await bridge.videoObserved(callID: "call-1", remoteVideo: true)
    guard case .object(let updated) = try await bridge.getSnapshot()["call"] else { Issue.record("no call"); return }
    call = updated
    #expect(call["localVideo"] == .string("on"))
    #expect(call["cameraFacing"] == .string("back"))
    #expect(call["remoteVideo"] == .bool(true))
    await #expect(throws: BridgeError.self) {
        _ = try await bridge.execute(["contractVersion": .string("0.2.0"), "operationId": .string("bad"),
            "type": .string("switchCamera"), "callId": .string("call-1"), "value": .string("side")])
    }
}
