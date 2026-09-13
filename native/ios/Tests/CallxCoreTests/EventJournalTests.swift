import Testing
@testable import CallxCore

@Test func journalReplaysAcknowledgesPrunesAndRecovers() async throws {
    var journal = EventJournal()
    journal.append(kind: "callChanged", observedAtMs: 1_000, callID: "call-1")
    journal.append(kind: "operationCompleted", observedAtMs: 2_000, operationID: "op-1")
    #expect(journal.replay(after: 0) == .replay(journal.state.events))
    try journal.acknowledge(through: 2)
    #expect(journal.state.acknowledged == 2)
    journal.prune(nowMs: 1_000 + EventJournal.retentionMs)
    #expect(journal.replay(after: 0) == .gap)

    let core = CallCoordinator(); await core.reportIncoming(callID: "call-2", nowMs: 3_000)
    let answer = NativeCommand(operationID: "answer", type: .answer, callID: "call-2", deadlineAtMs: 8_000)
    #expect(await core.prepare(answer, nowMs: 3_100) == .execute)
    await core.completeApplied(operationID: "answer", nowMs: 3_200)
    let recovered = CallCoordinator(checkpoint: await core.checkpoint())
    guard case let .replay(events) = await recovered.replayEvents(after: 0) else {
        Issue.record("Expected replay after recovery"); return
    }
    #expect(events.map(\.kind) == ["callChanged", "callChanged", "operationCompleted"])
}
