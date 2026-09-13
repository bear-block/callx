import Testing
import Foundation
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

@Test func checkpointRecoversPendingAndCompletedOperations() async throws {
    let directory = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: directory) }
    let store = CoordinatorFileStore(url: directory.appending(path: "coordinator.json"))
    let core = CallCoordinator(); await core.reportIncoming(callID: "call-1")
    let applied = NativeCommand(operationID: "applied", type: .answer, callID: "call-1", deadlineAtMs: 5_000)
    #expect(await core.prepare(applied, nowMs: 1_000) == .execute)
    await core.completeApplied(operationID: "applied", nowMs: 1_100)
    let pending = NativeCommand(operationID: "pending", type: .end, callID: "call-1", deadlineAtMs: 5_000)
    #expect(await core.prepare(pending, nowMs: 1_200) == .execute)
    try store.save(await core.checkpoint())

    let loaded = try store.load()
    let recovered = CallCoordinator(checkpoint: try #require(loaded))
    #expect(await recovered.snapshot()?.state == .connecting)
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
