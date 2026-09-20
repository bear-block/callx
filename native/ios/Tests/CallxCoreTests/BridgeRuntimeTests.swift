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
