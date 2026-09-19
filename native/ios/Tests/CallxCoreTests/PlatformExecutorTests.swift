import Testing
@testable import CallxCore

private actor FakeExecutor: PlatformCommandExecutor {
    var calls = 0
    let outcome: PlatformOutcome
    init(_ outcome: PlatformOutcome) { self.outcome = outcome }
    func perform(_ command: NativeCommand) async -> PlatformOutcome { calls += 1; return outcome }
}

private actor ControlledExecutor: PlatformCommandExecutor {
    var calls = 0
    private var continuation: CheckedContinuation<PlatformOutcome, Never>?
    func perform(_ command: NativeCommand) async -> PlatformOutcome {
        calls += 1
        return await withCheckedContinuation { continuation = $0 }
    }
    func finish(_ outcome: PlatformOutcome) { continuation?.resume(returning: outcome); continuation = nil }
}

@Test func dispatcherMapsAppliedRejectedDuplicateAndLateCallbacks() async throws {
    let appliedCore = CallCoordinator(); await appliedCore.reportIncoming(callID: "call-1")
    let appliedExecutor = FakeExecutor(.applied(completedAtMs: 1_100))
    let appliedDispatcher = CommandDispatcher(coordinator: appliedCore, executor: appliedExecutor)
    let answer = NativeCommand(operationID: "answer", type: .answer, callID: "call-1", deadlineAtMs: 2_000)
    #expect(try await appliedDispatcher.execute(answer, nowMs: 1_000).status == .applied)
    #expect(try await appliedDispatcher.execute(answer, nowMs: 1_200).status == .applied)
    #expect(await appliedExecutor.calls == 1)

    let rejectedCore = CallCoordinator(); await rejectedCore.reportIncoming(callID: "call-2")
    let rejectedExecutor = FakeExecutor(.rejected(errorCode: "platformRejected", completedAtMs: 1_100))
    let rejected = try await CommandDispatcher(coordinator: rejectedCore, executor: rejectedExecutor)
        .execute(NativeCommand(operationID: "reject", type: .answer, callID: "call-2", deadlineAtMs: 2_000), nowMs: 1_000)
    #expect(rejected.status == .rejected); #expect(await rejectedCore.snapshot()?.state == .incoming)

    let lateCore = CallCoordinator(); await lateCore.reportIncoming(callID: "call-3")
    let late = try await CommandDispatcher(coordinator: lateCore,
        executor: FakeExecutor(.applied(completedAtMs: 2_100)))
        .execute(NativeCommand(operationID: "late", type: .answer, callID: "call-3", deadlineAtMs: 2_000), nowMs: 1_000)
    #expect(late.status == .timedOut); #expect(await lateCore.snapshot()?.state == .incoming)
}

@Test func concurrentDuplicateCallersShareOnePlatformExecution() async throws {
    let core = CallCoordinator(); await core.reportIncoming(callID: "call-4")
    let executor = ControlledExecutor(); let dispatcher = CommandDispatcher(coordinator: core, executor: executor)
    let command = NativeCommand(operationID: "shared", type: .answer, callID: "call-4", deadlineAtMs: 5_000)
    async let first = dispatcher.execute(command, nowMs: 1_000)
    while await executor.calls == 0 { await Task.yield() }
    async let second = dispatcher.execute(command, nowMs: 1_001)
    await Task.yield(); await executor.finish(.applied(completedAtMs: 1_100))
    let results = try await [first, second]
    #expect(results[0] == results[1]); #expect(results[0].status == .applied)
    #expect(await executor.calls == 1)
}
