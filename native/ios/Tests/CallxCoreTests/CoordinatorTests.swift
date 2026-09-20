import Testing
import Foundation
@testable import CallxCore

@Test func outgoingRequiresMetadataAndCommitsOnlyAfterPlatformApplied() async {
    let core = CallCoordinator()
    let invalid = NativeCommand(operationID: "bad-start", type: .startCall, callID: "call-out", deadlineAtMs: 5_000)
    #expect(await core.prepare(invalid, nowMs: 1_000) == .existing(
        NativeOperation(operationID: "bad-start", status: .rejected, errorCode: "invalidArgument", completedAtMs: 1_000)))
    let start = NativeCommand(operationID: "start", type: .startCall, callID: "call-out",
        displayName: "hao.dev7", handle: "sip:hao.dev7@example.invalid", deadlineAtMs: 5_000)
    #expect(await core.prepare(start, nowMs: 1_001) == .execute)
    #expect(await core.snapshot() == nil)
    #expect(await core.completeApplied(operationID: "start", nowMs: 1_100)?.status == .applied)
    #expect(await core.operation("start")?.completedAtMs == 1_100)
    #expect(await core.snapshot() == CallRecord(callID: "call-out", state: .outgoing,
        displayName: "hao.dev7", handle: "sip:hao.dev7@example.invalid", direction: .outgoing, createdAtMs: 1_100))
    await core.remoteAnswered(callID: "call-out", nowMs: 1_200)
    #expect(await core.snapshot()?.state == .connecting)
    #expect(await core.snapshot()?.acceptedAtMs == 1_200)
    await core.mediaConnected(callID: "call-out", nowMs: 1_300)
    #expect(await core.snapshot()?.state == .active)
    #expect(await core.snapshot()?.mediaReady == true)
    #expect(await core.snapshot()?.mediaConnectedAtMs == 1_300)
}

@Test func stateCommitsOnlyAfterPlatformApplied() async {
    let core = CallCoordinator()
    await core.reportIncoming(callID: "call-1", displayName: "hao.dev7", handle: "+84901234567", nowMs: 900)
    let command = NativeCommand(operationID: "answer-1", type: .answer, callID: "call-1", deadlineAtMs: 5_000)
    #expect(await core.prepare(command, nowMs: 1_000) == .execute)
    #expect(await core.snapshot()?.state == .incoming)
    #expect(await core.completeApplied(operationID: "answer-1", nowMs: 2_000)?.status == .applied)
    #expect(await core.snapshot()?.state == .connecting)
    #expect(await core.snapshot()?.mediaReady == false)
}

@Test func checkpointRecoversPendingAndCompletedOperations() async throws {
    let directory = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: directory) }
    let store = CoordinatorFileStore(url: directory.appending(path: "coordinator.json"))
    let core = CallCoordinator()
    await core.reportIncoming(callID: "call-1", displayName: "hao.dev7", handle: "+84901234567", nowMs: 900)
    let applied = NativeCommand(operationID: "applied", type: .answer, callID: "call-1", deadlineAtMs: 5_000)
    #expect(await core.prepare(applied, nowMs: 1_000) == .execute)
    await core.completeApplied(operationID: "applied", nowMs: 1_100)
    let pending = NativeCommand(operationID: "pending", type: .end, callID: "call-1", deadlineAtMs: 5_000)
    #expect(await core.prepare(pending, nowMs: 1_200) == .execute)
    try store.save(await core.checkpoint())

    let loaded = try store.load()
    let recovered = CallCoordinator(checkpoint: try #require(loaded))
    #expect(await recovered.snapshot()?.state == .connecting)
    #expect(await recovered.snapshot()?.displayName == "hao.dev7")
    #expect(await recovered.snapshot()?.handle == "+84901234567")
    #expect(await recovered.snapshot()?.direction == .incoming)
    #expect(await recovered.snapshot()?.createdAtMs == 900)
    #expect(await recovered.snapshot()?.acceptedAtMs == 1_100)
    #expect(await recovered.operation("applied")?.status == .applied)
    #expect(await recovered.operation("pending")?.status == .pending)
    await recovered.expire(nowMs: 5_000)
    #expect(await recovered.operation("pending")?.status == .timedOut)
}

@Test func unsupportedCheckpointSchemaFailsClosed() throws {
    let directory = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: directory) }
    let url = directory.appending(path: "coordinator.json")
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    try Data("{\"schemaVersion\":2,\"pending\":[],\"completed\":[]}".utf8).write(to: url)
    #expect(throws: CoordinatorFileStore.StoreError.unsupportedSchema(2)) {
        try CoordinatorFileStore(url: url).load()
    }
}

@Test func duplicateAndConflictAreDeterministic() async {
    let core = CallCoordinator(); await core.reportIncoming(callID: "call-1")
    let command = NativeCommand(operationID: "same", type: .answer, callID: "call-1", deadlineAtMs: 5_000)
    #expect(await core.prepare(command, nowMs: 1_000) == .execute)
    #expect(await core.prepare(command, nowMs: 1_001) == .existing(NativeOperation(operationID: "same", status: .pending, errorCode: nil)))
    let changed = NativeCommand(operationID: "same", type: .end, callID: "call-1", deadlineAtMs: 5_000)
    #expect(await core.prepare(changed, nowMs: 1_002) == .conflict(NativeOperation(
        operationID: "same", status: .rejected, errorCode: "conflict", completedAtMs: 1_002)))
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
