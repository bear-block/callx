import Testing
@testable import CallxCore

private struct AppliedExecutor: PlatformCommandExecutor {
    func perform(_ command: NativeCommand) async -> PlatformOutcome { .applied(completedAtMs: 1_100) }
}
private final class EventReceiver: BridgeEventReceiving, @unchecked Sendable {
    var events: [BridgeObject] = []
    func receive(_ event: BridgeObject) { events.append(event) }
}

@Test func bridgeRoundTripsCommandSnapshotLookupAndObservation() async throws {
    let bridge = BridgeRuntime(coordinator: CallCoordinator(), executor: AppliedExecutor(), capabilities:
        BridgeCapabilities(accountGeneration: "generation-1", durableReplay: true,
            providerManagedSignaling: false, hold: true, mute: true), nowMs: { 1_000 })
    #expect(await bridge.setup()["nativeCalling"] == .bool(true))
    let opened = try await bridge.openSession(["contractVersion": .string("0.1.0")])
    let receiver = EventReceiver(); await bridge.setEventReceiver(receiver)
    let result = try await bridge.execute(["contractVersion": .string("0.1.0"),
        "operationId": .string("op-1"), "type": .string("startCall"), "input": .object([
            "callId": .string("call-1"), "displayName": .string("hao.dev7"),
            "handle": .string("sip:hao.dev7@example.invalid")])])
    #expect(result["status"] == .string("applied")); #expect(result["completedAtMs"] == .integer(1_100))
    guard case .object(let call) = try await bridge.getSnapshot()["call"] else { Issue.record("missing call"); return }
    #expect(call["displayName"] == .string("hao.dev7")); #expect(call["direction"] == .string("outgoing"))
    let lookup = try await bridge.queryOperation(["contractVersion": .string("0.1.0"),
        "operationId": .string("op-1"), "accountGeneration": .string("generation-1")])
    #expect(lookup["status"] == .string("available")); #expect(receiver.events.count == 2)
    #expect(receiver.events.allSatisfy { $0["sessionId"] == opened["sessionId"] })
}

@Test func bridgeHostIngressAndEveryCommandReachCanonicalMilestones() async throws {
    let bridge = BridgeRuntime(coordinator: CallCoordinator(), executor: AppliedExecutor(), capabilities:
        BridgeCapabilities(accountGeneration: "generation-1", durableReplay: true,
            providerManagedSignaling: false, hold: true, mute: true), nowMs: { 1_000 })
    try await bridge.reportIncoming(callID: "call-1", displayName: "hao.dev7", handle: "+84901234567", observedAtMs: 900)
    func command(_ id: String, _ type: String, value: Bool? = nil) -> BridgeObject {
        var result: BridgeObject = ["contractVersion": .string("0.1.0"), "operationId": .string(id),
            "type": .string(type), "callId": .string("call-1")]
        if let value { result["value"] = .bool(value) }; return result
    }
    #expect(try await bridge.execute(command("answer", "answer"))["status"] == .string("applied"))
    try await bridge.mediaConnected(callID: "call-1", observedAtMs: 1_200)
    #expect(try await bridge.execute(command("mute", "setMuted", value: true))["status"] == .string("applied"))
    #expect(try await bridge.execute(command("hold", "setHeld", value: true))["status"] == .string("applied"))
    guard case .object(let held) = try await bridge.getSnapshot()["call"] else { Issue.record("missing call"); return }
    #expect(held["state"] == .string("held"))
    #expect(try await bridge.execute(command("end", "end"))["status"] == .string("applied"))
}
