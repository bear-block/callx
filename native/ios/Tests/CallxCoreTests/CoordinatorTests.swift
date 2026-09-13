import Testing
@testable import CallxCore

@Test func stateCommitsOnlyAfterPlatformApplied() async {
    let core = CallCoordinator(); await core.reportIncoming(callID: "call-1")
    let command = NativeCommand(operationID: "answer-1", type: .answer, callID: "call-1", deadlineAtMs: 5_000)
    #expect(await core.prepare(command, nowMs: 1_000) == .execute)
    #expect(await core.snapshot()?.state == .incoming)
    #expect(await core.completeApplied(operationID: "answer-1", nowMs: 2_000)?.status == .applied)
    #expect(await core.snapshot()?.state == .connecting)
    #expect(await core.snapshot()?.mediaReady == false)
}

@Test func duplicateAndConflictAreDeterministic() async {
    let core = CallCoordinator(); await core.reportIncoming(callID: "call-1")
    let command = NativeCommand(operationID: "same", type: .answer, callID: "call-1", deadlineAtMs: 5_000)
    #expect(await core.prepare(command, nowMs: 1_000) == .execute)
    #expect(await core.prepare(command, nowMs: 1_001) == .existing(NativeOperation(operationID: "same", status: .pending, errorCode: nil)))
    let changed = NativeCommand(operationID: "same", type: .end, callID: "call-1", deadlineAtMs: 5_000)
    #expect(await core.prepare(changed, nowMs: 1_002) == .conflict(NativeOperation(operationID: "same", status: .rejected, errorCode: "conflict")))
}

@Test func timeoutAndRemoteEndDefeatLateCallbacks() async {
    let timeoutCore = CallCoordinator(); await timeoutCore.reportIncoming(callID: "call-1")
    let answer = NativeCommand(operationID: "answer", type: .answer, callID: "call-1", deadlineAtMs: 2_000)
    #expect(await timeoutCore.prepare(answer, nowMs: 1_000) == .execute)
    await timeoutCore.expire(nowMs: 2_000)
    #expect(await timeoutCore.completeApplied(operationID: "answer", nowMs: 2_100)?.status == .timedOut)
    #expect(await timeoutCore.snapshot()?.state == .incoming)

    let endedCore = CallCoordinator(); await endedCore.reportIncoming(callID: "call-2")
    let late = NativeCommand(operationID: "late", type: .answer, callID: "call-2", deadlineAtMs: 5_000)
    #expect(await endedCore.prepare(late, nowMs: 1_000) == .execute)
    await endedCore.remoteEnded(callID: "call-2")
    #expect(await endedCore.completeApplied(operationID: "late", nowMs: 1_100)?.status == .rejected)
    #expect(await endedCore.snapshot()?.state == .ended)
}
