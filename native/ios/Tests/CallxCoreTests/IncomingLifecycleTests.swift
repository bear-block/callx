import Testing
import Foundation
@testable import CallxCore

@Test func endedCallIsNeverResurrected() async {
    let core = CallCoordinator()
    #expect(await core.reportIncoming(callID: "call-1", displayName: "hao.dev7", handle: "+84901", nowMs: 1_000) == .accepted)
    #expect(await core.platformEnded(callID: "call-1", nowMs: 1_100))
    #expect(await core.snapshot()?.endReason == "declined")
    #expect(await core.reportIncoming(callID: "call-1", displayName: "hao.dev7", handle: "+84901", nowMs: 1_200)
        == .ended(reason: "declined"))
    #expect(await core.snapshot()?.state == .ended)
}

@Test func cancelBeforeInvitationBlocksTheLateInvitation() async {
    let core = CallCoordinator()
    #expect(await core.remoteEnded(callID: "call-2", reason: "callerCancelled", nowMs: 1_000) == false)
    #expect(await core.snapshot() == nil)
    #expect(await core.reportIncoming(callID: "call-2", displayName: "hao.dev7", handle: "+84901", nowMs: 1_100)
        == .ended(reason: "callerCancelled"))
    #expect(await core.snapshot() == nil)
}

@Test func remoteEndForAnotherIdLeavesTheLiveCallAlone() async {
    let core = CallCoordinator()
    await core.reportIncoming(callID: "call-1", displayName: "hao.dev7", handle: "+84901", nowMs: 1_000)
    #expect(await core.remoteEnded(callID: "call-2", reason: "callerCancelled", nowMs: 1_100) == false)
    #expect(await core.snapshot()?.state == .incoming)
    #expect(await core.terminalRecord(callID: "call-2", nowMs: 1_100)?.reason == "callerCancelled")
}

@Test func duplicateBusyAndExpiredInvitationsDoNotRing() async {
    let core = CallCoordinator()
    #expect(await core.reportIncoming(callID: "call-1", displayName: "hao.dev7", handle: "+84901", nowMs: 1_000) == .accepted)
    #expect(await core.reportIncoming(callID: "call-1", displayName: "hao.dev7", handle: "+84901", nowMs: 1_050) == .duplicate)
    #expect(await core.reportIncoming(callID: "call-3", displayName: "An", handle: "+84902", nowMs: 1_100) == .busy)
    await core.remoteEnded(callID: "call-1", reason: "remoteEnded", nowMs: 1_200)
    #expect(await core.reportIncoming(callID: "call-4", displayName: "Binh", handle: "+84903", nowMs: 1_300,
        expiresAtMs: 1_300) == .expired)
    #expect(await core.snapshot()?.state == .ended)
}

@Test func ringDeadlineEndsTheCallAsUnanswered() async {
    let core = CallCoordinator()
    await core.reportIncoming(callID: "call-1", displayName: "hao.dev7", handle: "+84901", nowMs: 1_000,
        ringDeadlineAtMs: 2_000, expiresAtMs: 1_500)
    #expect(await core.snapshot()?.ringDeadlineAtMs == 1_500)
    #expect(await core.expireRinging(nowMs: 1_499) == nil)
    #expect(await core.expireRinging(nowMs: 1_500) == "call-1")
    #expect(await core.snapshot()?.endReason == "unanswered")
    #expect(await core.reportIncoming(callID: "call-1", displayName: "hao.dev7", handle: "+84901", nowMs: 1_600)
        == .ended(reason: "unanswered"))
}

@Test func answerAfterTheRingDeadlineIsRejected() async {
    let core = CallCoordinator()
    await core.reportIncoming(callID: "call-1", displayName: "hao.dev7", handle: "+84901", nowMs: 1_000, ringDeadlineAtMs: 1_500)
    let answer = NativeCommand(operationID: "answer", type: .answer, callID: "call-1", deadlineAtMs: 5_000)
    guard case .existing(let result) = await core.prepare(answer, nowMs: 1_600) else {
        Issue.record("answer should complete immediately"); return
    }
    #expect(result.errorCode == "invalidState")
    #expect(await core.snapshot()?.endReason == "unanswered")
}

@Test func platformAnswerClearsTheRingDeadline() async {
    let core = CallCoordinator()
    await core.reportIncoming(callID: "call-1", displayName: "hao.dev7", handle: "+84901", nowMs: 1_000, ringDeadlineAtMs: 1_500)
    #expect(await core.platformAnswered(callID: "call-1", nowMs: 1_100))
    #expect(await core.platformAnswered(callID: "call-1", nowMs: 1_150) == false)
    #expect(await core.snapshot()?.state == .connecting)
    #expect(await core.expireRinging(nowMs: 9_000) == nil)
    #expect(await core.platformEnded(callID: "call-1", nowMs: 1_200))
    #expect(await core.snapshot()?.endReason == "localHangup")
}

@Test func startCallCannotReuseAnEndedId() async {
    let core = CallCoordinator()
    await core.remoteEnded(callID: "call-9", reason: "remoteEnded", nowMs: 1_000)
    let start = NativeCommand(operationID: "start", type: .startCall, callID: "call-9",
        displayName: "hao.dev7", handle: "sip:hao.dev7@example.invalid", deadlineAtMs: 5_000)
    guard case .existing(let result) = await core.prepare(start, nowMs: 1_100) else {
        Issue.record("startCall should be rejected"); return
    }
    #expect(result.errorCode == "invalidState")
}

@Test func localEndRecordsATombstone() async {
    let core = CallCoordinator()
    await core.reportIncoming(callID: "call-1", displayName: "hao.dev7", handle: "+84901", nowMs: 1_000)
    let end = NativeCommand(operationID: "end", type: .end, callID: "call-1", deadlineAtMs: 5_000)
    #expect(await core.prepare(end, nowMs: 1_100) == .execute)
    await core.completeApplied(operationID: "end", nowMs: 1_200)
    #expect(await core.terminalRecord(callID: "call-1", nowMs: 1_300)?.reason == "declined")
}

@Test func tombstonesSurviveACheckpointAndExpireAfterRetention() async throws {
    let url = FileManager.default.temporaryDirectory.appending(path: "callx-terminal-\(UUID().uuidString)/core.json")
    defer { try? FileManager.default.removeItem(at: url.deletingLastPathComponent()) }
    let core = try CallCoordinator(store: CoordinatorFileStore(url: url))
    try await core.durableRemoteEnded(callID: "call-2", reason: "callerCancelled", nowMs: 1_000)
    try await core.durableReportIncoming(callID: "call-3", displayName: "An", handle: "+84902", nowMs: 1_100,
        ringDeadlineAtMs: 9_000)
    let recovered = try CallCoordinator(store: CoordinatorFileStore(url: url))
    #expect(await recovered.reportIncoming(callID: "call-2", displayName: "hao.dev7", handle: "+84901", nowMs: 1_200)
        == .ended(reason: "callerCancelled"))
    #expect(await recovered.snapshot()?.ringDeadlineAtMs == 9_000)
    #expect(await recovered.terminalRecord(callID: "call-2", nowMs: 1_000 + CallCoordinator.terminalRetentionMs) == nil)
}

@Test func terminalLedgerKeepsTheNewestRecordsWithinQuota() async {
    let core = CallCoordinator()
    for index in 0...CallCoordinator.terminalQuota {
        await core.remoteEnded(callID: "call-\(index)", reason: "remoteEnded", nowMs: 1_000 + Int64(index))
    }
    #expect(await core.terminalRecord(callID: "call-0", nowMs: 5_000) == nil)
    #expect(await core.terminalRecord(callID: "call-\(CallCoordinator.terminalQuota)", nowMs: 5_000) != nil)
}

@Test func olderCheckpointsWithoutTombstonesStillLoad() throws {
    let legacy = try JSONDecoder().decode(CoordinatorCheckpoint.self,
        from: Data(#"{"schemaVersion":1,"pending":[],"completed":[]}"#.utf8))
    #expect(legacy.terminal == nil)
}

@Test func systemMuteAndHoldAreRecordedOnlyWhenTheyApply() async {
    let core = CallCoordinator()
    await core.reportIncoming(callID: "call-1", displayName: "hao.dev7", handle: "+84901", nowMs: 1_000)
    #expect(await core.platformMuted(callID: "call-1", muted: true, nowMs: 1_050) == false)
    #expect(await core.platformHeld(callID: "call-1", held: true, nowMs: 1_060) == false)
    await core.platformAnswered(callID: "call-1", nowMs: 1_100)
    #expect(await core.platformMuted(callID: "call-1", muted: true, nowMs: 1_200))
    #expect(await core.platformMuted(callID: "call-1", muted: true, nowMs: 1_210) == false)
    #expect(await core.platformHeld(callID: "call-1", held: true, nowMs: 1_220) == false)
    await core.mediaConnected(callID: "call-1", nowMs: 1_300)
    #expect(await core.platformHeld(callID: "call-1", held: true, nowMs: 1_400))
    #expect(await core.snapshot()?.state == .held)
    #expect(await core.platformHeld(callID: "call-1", held: false, nowMs: 1_500))
    #expect(await core.snapshot()?.state == .active)
    #expect(await core.snapshot()?.muted == true)
    #expect(await core.platformMuted(callID: "call-2", muted: false, nowMs: 1_600) == false)
}
