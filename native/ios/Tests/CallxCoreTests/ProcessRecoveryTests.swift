import Testing
import Foundation
@testable import CallxCore

@Test func processRecoveryTerminatesEveryLostLiveSessionAndPreservesTerminalReason() async throws {
    for state in [CallState.incoming, .outgoing, .connecting, .active, .held, .ended] {
        let previous = CallRecord(callID: "old-call", state: state, mediaReady: state == .active,
            endReason: state == .ended ? "callerCancelled" : nil, ringDeadlineAtMs: 5_000)
        let core = CallCoordinator(checkpoint: CoordinatorCheckpoint(call: previous, pending: [], completed: []))
        let recovered = try await core.durableRecoverAfterProcessDeath(nowMs: 2_000)
        #expect(recovered?.state == .ended)
        #expect(recovered?.mediaReady == false)
        #expect(recovered?.endReason == (state == .ended ? "callerCancelled" : "failed"))
        let watermark = await core.observationCapture().watermark
        #expect(try await core.durableRecoverAfterProcessDeath(nowMs: 3_000) == recovered)
        #expect(await core.observationCapture().watermark == watermark)
    }
}

@Test func expiredCheckpointWithoutPendingCommandsIsRecoveredDurably() async throws {
    let directory = FileManager.default.temporaryDirectory.appending(path: "callx-recovery-\(UUID().uuidString)")
    defer { try? FileManager.default.removeItem(at: directory) }
    let store = CoordinatorFileStore(url: directory.appending(path: "state.json"))
    let core = try CallCoordinator(store: store)
    try await core.durableReportIncoming(callID: "old-call", nowMs: 1_000, ringDeadlineAtMs: 1_500)
    let restored = try CallCoordinator(store: store)
    #expect(await restored.pendingCommands().isEmpty)
    #expect(try await restored.durableRecoverAfterProcessDeath(nowMs: 2_000)?.endReason == "unanswered")
    let restarted = try CallCoordinator(store: store)
    #expect(await restarted.snapshot()?.endReason == "unanswered")
    #expect(try await restarted.durableReportIncoming(callID: "old-call", nowMs: 2_100) == .ended(reason: "unanswered"))
    #expect(try await restarted.durableReportIncoming(callID: "new-call", nowMs: 2_200) == .accepted)
}

@Test func processRecoverySettlesPendingCommandsAndDoesNotReplayTheirEffects() async throws {
    let core = CallCoordinator()
    try await core.durableReportIncoming(callID: "old-call", nowMs: 1_000)
    _ = try await core.durablePrepare(NativeCommand(operationID: "answer", type: .answer,
        callID: "old-call", deadlineAtMs: 9_000), nowMs: 1_100)
    let restored = CallCoordinator(checkpoint: await core.checkpoint())
    _ = try await restored.durableRecoverAfterProcessDeath(nowMs: 2_000)
    #expect(await restored.pendingCommands().isEmpty)
    #expect(await restored.operation("answer")?.status == .rejected)
    #expect(await restored.operation("answer")?.errorCode == "invalidState")
}

@Test func oldRingTimerCannotExpireANewerCall() async throws {
    let core = CallCoordinator()
    try await core.durableReportIncoming(callID: "new-call", nowMs: 1_000, ringDeadlineAtMs: 1_500)
    #expect(try await core.durableExpireRinging(nowMs: 2_000, callID: "old-call") == nil)
    #expect(await core.snapshot()?.state == .incoming)
    #expect(try await core.durableExpireRinging(nowMs: 2_000, callID: "new-call") == "new-call")
}
