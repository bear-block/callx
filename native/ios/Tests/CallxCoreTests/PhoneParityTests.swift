import Testing
import Foundation
@testable import CallxCore

// ADR-0013: audio routes are observed call state; routes, tones and names change by command.

private let routes = [AudioRoute(id: "ear", kind: .earpiece, name: "Phone"),
    AudioRoute(id: "spk", kind: .speaker, name: "Speaker"), AudioRoute(id: "bt", kind: .bluetooth, name: "Car kit")]

private func active(_ core: CallCoordinator = CallCoordinator()) async -> CallCoordinator {
    await core.reportIncoming(callID: "call-1", displayName: "hao.dev7", handle: "+84901", nowMs: 900)
    _ = await core.prepare(NativeCommand(operationID: "answer", type: .answer, callID: "call-1", deadlineAtMs: 5_000), nowMs: 1_000)
    await core.completeApplied(operationID: "answer", nowMs: 1_000)
    await core.mediaConnected(callID: "call-1", nowMs: 1_050)
    return core
}

private func run(_ core: CallCoordinator, _ command: NativeCommand, at: Int64 = 1_100) async -> NativeOperation? {
    switch await core.prepare(command, nowMs: at) {
    case .existing(let operation), .conflict(let operation): return operation
    case .execute: return await core.completeApplied(operationID: command.operationID, nowMs: at + 10)
    }
}

private func route(_ id: String, _ routeID: String?) -> NativeCommand {
    NativeCommand(operationID: id, type: .setAudioRoute, callID: "call-1", deadlineAtMs: 5_000, audioRoute: routeID)
}

@Test func routesAreObservedAndAnUnlistedCurrentRouteIsUnknown() async {
    let core = await active()
    #expect(await core.audioRoutesObserved(callID: "call-1", current: "ear", routes: routes, nowMs: 1_060))
    #expect(await core.snapshot()?.audioRoutes == routes)
    #expect(await core.snapshot()?.audioRoute == "ear")
    #expect(await !core.audioRoutesObserved(callID: "call-1", current: "ear", routes: routes, nowMs: 1_061))
    await core.audioRoutesObserved(callID: "call-1", current: "gone", routes: Array(routes.prefix(2)), nowMs: 1_070)
    #expect(await core.snapshot()?.audioRoute == nil)
    #expect(await !core.audioRoutesObserved(callID: "call-2", current: "ear", routes: routes, nowMs: 1_080))
}

@Test func setAudioRouteNeedsAListedRouteAndACallWithAudio() async {
    let ringing = CallCoordinator()
    await ringing.reportIncoming(callID: "call-1", displayName: "hao.dev7", handle: "+84901", nowMs: 900)
    await ringing.audioRoutesObserved(callID: "call-1", current: "ear", routes: routes, nowMs: 950)
    #expect(await run(ringing, route("ringing", "spk"))?.errorCode == "invalidState")
    let core = await active()
    await core.audioRoutesObserved(callID: "call-1", current: "ear", routes: routes, nowMs: 1_060)
    #expect(await run(core, route("unknown", "hdmi"))?.errorCode == "invalidArgument")
    #expect(await run(core, route("missing", nil))?.errorCode == "invalidArgument")
    #expect(await run(core, route("speaker", "spk"))?.status == .applied)
    #expect(await core.snapshot()?.audioRoute == "spk")
}

@Test func endingClearsRoutes() async {
    let core = await active()
    await core.audioRoutesObserved(callID: "call-1", current: "ear", routes: routes, nowMs: 1_060)
    await core.remoteEnded(callID: "call-1", nowMs: 1_200)
    #expect(await core.snapshot()?.audioRoutes == [])
    #expect(await core.snapshot()?.audioRoute == nil)
}

@Test func dtmfNeedsAnActiveCallAndKeypadDigitsAndChangesNothing() async {
    let ringing = CallCoordinator()
    await ringing.reportIncoming(callID: "call-1", displayName: "hao.dev7", handle: "+84901", nowMs: 900)
    #expect(await run(ringing, NativeCommand(operationID: "early", type: .sendDtmf, callID: "call-1", deadlineAtMs: 5_000,
        digits: "1"))?.errorCode == "invalidState")
    let core = await active()
    #expect(await run(core, NativeCommand(operationID: "letters", type: .sendDtmf, callID: "call-1", deadlineAtMs: 5_000,
        digits: "12a"))?.errorCode == "invalidArgument")
    let before = await core.snapshot()
    let sequence = await core.checkpoint().journal!.nextSequence
    #expect(await run(core, NativeCommand(operationID: "tones", type: .sendDtmf, callID: "call-1", deadlineAtMs: 5_000,
        digits: "*12#"))?.status == .applied)
    #expect(await core.snapshot() == before)
    guard case .replay(let events) = await core.replayEvents(after: sequence - 1) else { Issue.record("gap"); return }
    #expect(events.map(\.kind) == ["operationCompleted"])
}

@Test func setDisplayNameRenamesALiveCall() async {
    let core = CallCoordinator()
    await core.reportIncoming(callID: "call-1", displayName: "hao.dev7", handle: "+84901", nowMs: 900)
    #expect(await run(core, NativeCommand(operationID: "rename", type: .setDisplayName, callID: "call-1",
        displayName: "Front desk", deadlineAtMs: 5_000))?.status == .applied)
    #expect(await core.snapshot()?.displayName == "Front desk")
    #expect(await run(core, NativeCommand(operationID: "empty", type: .setDisplayName, callID: "call-1",
        displayName: "", deadlineAtMs: 5_000))?.errorCode == "invalidArgument")
}

@Test func routesSurviveACheckpointAndOlderCheckpointsStillDecode() async throws {
    let url = FileManager.default.temporaryDirectory.appendingPathComponent("callx-parity-\(UUID())/coordinator.json")
    let core = try CallCoordinator(store: CoordinatorFileStore(url: url))
    try await core.durableReportIncoming(callID: "call-1", displayName: "hao.dev7", handle: "+84901", nowMs: 900)
    try await core.durableAudioRoutesObserved(callID: "call-1", current: "bt", routes: routes, nowMs: 950)
    let restored = try CallCoordinator(store: CoordinatorFileStore(url: url))
    #expect(await restored.snapshot() == core.snapshot())
    let old = #"{"callID":"call-1","state":"active","muted":false,"mediaReady":true}"#
    let decoded = try JSONDecoder().decode(CallRecord.self, from: Data(old.utf8))
    #expect(decoded.audioRoutes == [] && decoded.audioRoute == nil)
}

private struct Applied: PlatformCommandExecutor {
    func perform(_ command: NativeCommand) async -> PlatformOutcome { .applied(completedAtMs: 1_100) }
}

@Test func theBridgeDecodesTheNewCommandsAndCarriesRoutesOnlyWhenKnown() async throws {
    let core = await active()
    let bridge = BridgeRuntime(coordinator: core, executor: Applied(), capabilities: BridgeCapabilities(
        accountGeneration: "generation-1", durableReplay: true, providerManagedSignaling: false, hold: true, mute: true,
        dtmf: true), nowMs: { 1_000 })
    #expect(try await bridge.setup(["contractVersion": .string("0.3.0")])["dtmf"] == .bool(true))
    func execute(_ id: String, _ type: String, _ value: BridgeValue) async throws -> BridgeObject {
        try await bridge.execute(["contractVersion": .string("0.3.0"), "operationId": .string(id), "type": .string(type),
            "callId": .string("call-1"), "value": value])
    }
    func call() async throws -> BridgeObject {
        guard case .object(let call) = try await bridge.getSnapshot()["call"] else { return [:] }
        return call
    }
    #expect(try await call()["audioRoutes"] == nil)
    let long = String(repeating: "é", count: 100)
    try await bridge.audioRoutesObserved(callID: "call-1", current: "ear",
        routes: routes + [AudioRoute(id: long, kind: .other, name: "")])
    guard case .array(let listed) = try await call()["audioRoutes"] else { Issue.record("no routes"); return }
    #expect(listed.first == .object(["id": .string("ear"), "kind": .string("earpiece"), "name": .string("Phone")]))
    #expect(listed.last == .object(["id": .string(String(repeating: "é", count: 64)), "kind": .string("other"),
        "name": .string("other")]))
    #expect(try await call()["audioRoute"] == .string("ear"))
    #expect(try await execute("spk", "setAudioRoute", .string("spk"))["status"] == .string("applied"))
    #expect(try await call()["audioRoute"] == .string("spk"))
    #expect(try await execute("tones", "sendDtmf", .string("123"))["status"] == .string("applied"))
    #expect(try await execute("name", "setDisplayName", .string("Front desk"))["status"] == .string("applied"))
    #expect(try await call()["displayName"] == .string("Front desk"))
    await #expect(throws: BridgeError.self) { _ = try await execute("bad-dtmf", "sendDtmf", .string("abc")) }
    await #expect(throws: BridgeError.self) { _ = try await execute("bad-route", "setAudioRoute", .bool(true)) }
    await #expect(throws: BridgeError.self) { _ = try await execute("bad-name", "setDisplayName", .string("")) }
}

@Test func aDisconnectedRouteCannotReappearWhenItsCommandCompletes() async {
    let core = await active()
    await core.audioRoutesObserved(callID: "call-1", current: "ear", routes: routes, nowMs: 1_060)
    guard case .execute = await core.prepare(route("switch-late", "bt"), nowMs: 1_100) else {
        Issue.record("route command must execute"); return
    }
    await core.audioRoutesObserved(callID: "call-1", current: "ear", routes: Array(routes.prefix(2)), nowMs: 1_110)
    #expect(await core.completeApplied(operationID: "switch-late", nowMs: 1_120)?.status == .applied)
    #expect(await core.snapshot()?.audioRoute == "ear")
}
