import Testing
@testable import CallxCore

private final class FaultStore: CoordinatorStore, @unchecked Sendable {
    var saved: CoordinatorCheckpoint?
    var failWrites = false
    func load() throws -> CoordinatorCheckpoint? { saved }
    func save(_ checkpoint: CoordinatorCheckpoint) throws {
        if failWrites { throw Failure.injected }
        saved = checkpoint
    }
    enum Failure: Error { case injected }
}

@Test func durableMutationPersistsBeforeSuccessAndRollsBackOnWriteFailure() async throws {
    let store = FaultStore()
    let core = try CallCoordinator(store: store)
    try await core.durableReportIncoming(callID: "call-1", nowMs: 1_000)
    #expect(store.saved?.call?.state == .incoming)

    let command = NativeCommand(operationID: "answer", type: .answer, callID: "call-1", deadlineAtMs: 5_000)
    store.failWrites = true
    await #expect(throws: FaultStore.Failure.injected) {
        try await core.durablePrepare(command, nowMs: 1_100)
    }
    #expect(await core.operation("answer") == nil)
    #expect(store.saved?.pending.isEmpty == true)

    let recovered = try CallCoordinator(store: store)
    #expect(await recovered.snapshot()?.state == .incoming)
    #expect(await recovered.operation("answer") == nil)
}

@Test func failedRecoveryWritePreservesTheCheckpointForRetry() async throws {
    let store = FaultStore()
    let core = try CallCoordinator(store: store)
    try await core.durableReportIncoming(callID: "old-call", nowMs: 1_000, ringDeadlineAtMs: 1_500)
    let before = await core.checkpoint()
    store.failWrites = true
    await #expect(throws: FaultStore.Failure.injected) {
        try await core.durableRecoverAfterProcessDeath(nowMs: 2_000)
    }
    #expect(await core.checkpoint() == before)
    #expect(store.saved == before)
    store.failWrites = false
    #expect(try await core.durableRecoverAfterProcessDeath(nowMs: 2_000)?.endReason == "unanswered")
}
