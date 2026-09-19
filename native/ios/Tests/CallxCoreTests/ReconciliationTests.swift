import Testing
@testable import CallxCore

private struct Probe: OperationReconciliationProbe {
    let outcome: ReconciliationOutcome
    func query(_ command: NativeCommand) async -> ReconciliationOutcome { outcome }
}

@Test func recoveredPendingReconcilesWithoutBlindRetry() async throws {
    let source = CallCoordinator(); await source.reportIncoming(callID: "call-1")
    let command = NativeCommand(operationID: "pending", type: .answer, callID: "call-1", deadlineAtMs: 5_000)
    #expect(await source.prepare(command, nowMs: 1_000) == .execute)

    let applied = CallCoordinator(checkpoint: await source.checkpoint())
    let appliedResults = try await RecoveredOperationReconciler(coordinator: applied,
        probe: Probe(outcome: .applied(observedAtMs: 1_100))).reconcile(nowMs: 1_050)
    #expect(appliedResults.first?.status == .applied); #expect(await applied.snapshot()?.state == .connecting)

    let unknown = CallCoordinator(checkpoint: await source.checkpoint())
    let unknownResults = try await RecoveredOperationReconciler(coordinator: unknown,
        probe: Probe(outcome: .unavailable(observedAtMs: 1_100))).reconcile(nowMs: 1_050)
    #expect(unknownResults.first?.status == .unknown); #expect(await unknown.snapshot()?.state == .incoming)

    let expired = CallCoordinator(checkpoint: await source.checkpoint())
    let expiredResults = try await RecoveredOperationReconciler(coordinator: expired,
        probe: Probe(outcome: .applied(observedAtMs: 5_100))).reconcile(nowMs: 5_000)
    #expect(expiredResults.first?.status == .timedOut); #expect(await expired.snapshot()?.state == .incoming)
}
