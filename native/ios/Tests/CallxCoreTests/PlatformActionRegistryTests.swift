import Testing
@testable import CallxCore

@Test func registryBuffersEarlyCallbackAndFirstTerminalWins() async {
    let registry = PlatformActionRegistry()
    #expect(await registry.complete("early", with: .applied(completedAtMs: 10)))
    #expect(await registry.outcome(for: "early") == .applied(completedAtMs: 10))
    #expect(await registry.complete("early", with: .rejected(errorCode: "late", completedAtMs: 11)) == false)
}

@Test func timeoutAndProviderResetResumeWaitersAndDefeatLateCallbacks() async {
    let registry = PlatformActionRegistry()
    async let timedOut = registry.outcome(for: "timeout")
    while await !registry.isPending("timeout") { await Task.yield() }
    await registry.timeout("timeout", atMs: 20)
    #expect(await timedOut == .timedOut(completedAtMs: 20))
    #expect(await registry.complete("timeout", with: .applied(completedAtMs: 21)) == false)

    async let reset = registry.outcome(for: "reset")
    while await !registry.isPending("reset") { await Task.yield() }
    await registry.providerReset(atMs: 30)
    #expect(await reset == .providerReset(completedAtMs: 30))
}
