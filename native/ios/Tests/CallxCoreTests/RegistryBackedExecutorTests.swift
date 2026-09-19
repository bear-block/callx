import Testing
@testable import CallxCore

private struct Submitter: PlatformTransactionSubmitter {
    let result: PlatformSubmission
    func submit(_ command: NativeCommand) async -> PlatformSubmission { result }
}

@Test func acceptedSubmissionWaitsForActionWhileRejectedSubmissionDoesNot() async throws {
    let registry = PlatformActionRegistry()
    let accepted = RegistryBackedPlatformExecutor(submitter: Submitter(result: .accepted), registry: registry)
    let command = NativeCommand(operationID: "op", type: .answer, callID: "call", deadlineAtMs: 5_000)
    async let outcome = accepted.perform(command)
    while await !registry.isPending("op") { await Task.yield() }
    #expect(await registry.complete("op", with: .rejected(errorCode: "platformRejected", completedAtMs: 2_000)))
    #expect(await outcome == .rejected(errorCode: "platformRejected", completedAtMs: 2_000))

    let rejected = RegistryBackedPlatformExecutor(
        submitter: Submitter(result: .rejected(errorCode: "transactionRejected", completedAtMs: 1_000)),
        registry: PlatformActionRegistry())
    #expect(await rejected.perform(command) == .rejected(errorCode: "transactionRejected", completedAtMs: 1_000))
}

@Test func registryTimeoutAndResetKeepDistinctTerminalSemantics() async {
    let timeoutRegistry = PlatformActionRegistry()
    let timeoutExecutor = RegistryBackedPlatformExecutor(submitter: Submitter(result: .accepted), registry: timeoutRegistry)
    let timeoutCommand = NativeCommand(operationID: "timeout", type: .answer, callID: "call", deadlineAtMs: 5_000)
    async let timeout = timeoutExecutor.perform(timeoutCommand)
    while await !timeoutRegistry.isPending("timeout") { await Task.yield() }
    await timeoutRegistry.timeout("timeout", atMs: 5_000)
    #expect(await timeout == .timedOut(completedAtMs: 5_000))

    let resetRegistry = PlatformActionRegistry()
    let resetExecutor = RegistryBackedPlatformExecutor(submitter: Submitter(result: .accepted), registry: resetRegistry)
    let resetCommand = NativeCommand(operationID: "reset", type: .answer, callID: "call", deadlineAtMs: 5_000)
    async let reset = resetExecutor.perform(resetCommand)
    while await !resetRegistry.isPending("reset") { await Task.yield() }
    await resetRegistry.providerReset(atMs: 2_000)
    #expect(await reset == .unknown(errorCode: "nativeUnavailable", completedAtMs: 2_000))
}
