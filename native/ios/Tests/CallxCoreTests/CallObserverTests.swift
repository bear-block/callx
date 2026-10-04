import Foundation
import Testing
@testable import CallxCore

private final class NativeCallLog: @unchecked Sendable {
    private let lock = NSLock()
    private var calls: [CallState?] = []
    func append(_ call: CallRecord?) { lock.withLock { calls.append(call?.state) } }
    var states: [CallState?] { lock.withLock { calls } }
}
private struct ObserverExecutor: PlatformCommandExecutor {
    func perform(_ command: NativeCommand) async -> PlatformOutcome { .applied(completedAtMs: 1_000) }
}

@Test func nativePresentationObservesCallEndWithoutAFrameworkSessionAndCanUnsubscribe() async throws {
    let runtime = BridgeRuntime(coordinator: CallCoordinator(), executor: ObserverExecutor(), capabilities:
        .init(accountGeneration: "g", durableReplay: true, providerManagedSignaling: false, hold: true, mute: true),
        nowMs: { 1_000 })
    let first = NativeCallLog(), second = NativeCallLog()
    let token = await runtime.addCallObserver { call, _ in first.append(call) }
    let other = await runtime.addCallObserver { call, _ in second.append(call) }
    #expect(first.states == [nil])
    try await runtime.reportIncoming(callID: "observer-1", displayName: "Steven", handle: "steven")
    _ = try await runtime.platformAnswered(callID: "observer-1")
    await runtime.removeCallObserver(token)
    let before = first.states
    _ = try await runtime.remoteEnded(callID: "observer-1")
    #expect(first.states == before)
    #expect(second.states.last == .ended)
    #expect(await runtime.currentCall()?.state == .ended)
    await runtime.removeCallObserver(other)
}
