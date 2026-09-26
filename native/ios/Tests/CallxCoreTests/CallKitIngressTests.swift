#if os(iOS)
import CallKit
import Foundation
import PushKit
import Testing
@testable import CallxCore

private final class FakeReporter: CallKitIncomingReporting, @unchecked Sendable {
    private let lock = NSLock()
    private var _reported: [UUID] = []
    private var _ended: [(UUID, CXCallEndedReason)] = []
    private var _connected: [UUID] = []
    var failReports = false
    var reported: [UUID] { lock.lock(); defer { lock.unlock() }; return _reported }
    var ended: [(UUID, CXCallEndedReason)] { lock.lock(); defer { lock.unlock() }; return _ended }
    var connected: [UUID] { lock.lock(); defer { lock.unlock() }; return _connected }
    private func record(_ uuid: UUID) { lock.lock(); _reported.append(uuid); lock.unlock() }
    func reportNewIncomingCall(with uuid: UUID, update: CXCallUpdate) async throws {
        record(uuid)
        if failReports { throw CXErrorCodeIncomingCallError(.filteredByDoNotDisturb) }
    }
    func reportCall(with uuid: UUID, endedAt: Date?, reason: CXCallEndedReason) {
        lock.lock(); _ended.append((uuid, reason)); lock.unlock()
    }
    func reportOutgoingCall(with uuid: UUID, connectedAt: Date?) {
        lock.lock(); _connected.append(uuid); lock.unlock()
    }
}

private final class Listener: CallKitIngressListener, @unchecked Sendable {
    private let lock = NSLock()
    private var _accepted: [String] = []
    private var _rejected: [(String?, IncomingOutcome?)] = []
    private var _timedOut: [String] = []
    var accepted: [String] { lock.lock(); defer { lock.unlock() }; return _accepted }
    var rejected: [(String?, IncomingOutcome?)] { lock.lock(); defer { lock.unlock() }; return _rejected }
    var timedOut: [String] { lock.lock(); defer { lock.unlock() }; return _timedOut }
    func invitationAccepted(_ invitation: Invitation) { lock.lock(); _accepted.append(invitation.callID); lock.unlock() }
    func invitationRejected(_ invitation: Invitation?, outcome: IncomingOutcome?) {
        lock.lock(); _rejected.append((invitation?.callID, outcome)); lock.unlock()
    }
    func ringTimedOut(callID: String) { lock.lock(); _timedOut.append(callID); lock.unlock() }
}

private struct AppliedIngressExecutor: PlatformCommandExecutor {
    func perform(_ command: NativeCommand) async -> PlatformOutcome { .applied(completedAtMs: 0) }
}

private final class RecordingSystemAnswer: CXAnswerCallAction, @unchecked Sendable {
    override func fulfill() {}
    override func fail() {}
}

private struct Harness {
    let ingress: CallKitIngress
    let runtime: BridgeRuntime
    let reporter = FakeReporter()
    let listener = Listener()
    let uuids = CallUUIDMap()
    let lifecycle = CallKitActionLifecycle(index: CallKitActionIndex(), registry: PlatformActionRegistry(), nowMs: { 0 })

    init(ringTimeoutMs: Int64 = 45_000) {
        let now: @Sendable () -> Int64 = { Int64(Date().timeIntervalSince1970 * 1000) }
        runtime = BridgeRuntime(coordinator: CallCoordinator(), executor: AppliedIngressExecutor(), capabilities:
            BridgeCapabilities(accountGeneration: "generation-1", durableReplay: true,
                providerManagedSignaling: false, hold: true, mute: true), nowMs: now)
        ingress = CallKitIngress(runtime: runtime, reporter: reporter, uuids: uuids, lifecycle: lifecycle,
            listener: listener, ringTimeoutMs: ringTimeoutMs, nowMs: now)
    }

    func push(_ callID: String, mustReport: Bool = true) async {
        await push(["callx": ["schemaVersion": 1, "type": "call.invited", "callId": callID,
            "displayName": "hao.dev7", "handle": "+84901"]], mustReport: mustReport)
    }
    func push(_ payload: [AnyHashable: Any], mustReport: Bool) async {
        let ingress = self.ingress
        await withCheckedContinuation { (done: CheckedContinuation<Void, Never>) in
            ingress.receive(payload, mustReport: mustReport) { done.resume() }
        }
    }
    func callState() async throws -> BridgeValue? {
        guard case .object(let call) = try await runtime.getSnapshot()["call"] else { return nil }
        return call["state"]
    }
}

private func eventually(_ condition: () async throws -> Bool) async rethrows -> Bool {
    for _ in 0..<150 {
        if try await condition() { return true }
        try? await Task.sleep(nanoseconds: 20_000_000)
    }
    return false
}

@Test func acceptedPushRingsWithTheMappedUUID() async throws {
    let h = Harness()
    await h.push("call-1")
    #expect(h.reporter.reported == [h.uuids.uuid(for: "call-1")])
    #expect(h.reporter.ended.isEmpty)
    #expect(h.listener.accepted == ["call-1"])
    #expect(try await h.callState() == .string("incoming"))
}

@Test func duplicatePushReportsTheLiveCallWithoutEndingIt() async throws {
    let h = Harness()
    await h.push("call-1"); await h.push("call-1")
    #expect(h.reporter.reported == [h.uuids.uuid(for: "call-1"), h.uuids.uuid(for: "call-1")])
    #expect(h.reporter.ended.isEmpty)
    #expect(h.listener.rejected.last?.1 == .duplicate)
    #expect(try await h.callState() == .string("incoming"))
}

@Test func pushForAnEndedCallIsReportedUnderAFreshIDAndEnded() async throws {
    let h = Harness()
    try await h.ingress.remoteEnded(callID: "call-2", reason: "callerCancelled")
    await h.push("call-2", mustReport: false)
    #expect(h.reporter.reported.isEmpty)
    await h.push("call-2", mustReport: true)
    let fresh = try #require(h.reporter.reported.first)
    #expect(fresh != h.uuids.uuid(for: "call-2"))
    #expect(h.reporter.ended.map(\.0) == [fresh])
    #expect(h.reporter.ended.map(\.1) == [.remoteEnded])
    #expect(h.listener.rejected.last?.1 == .ended(reason: "callerCancelled"))
    #expect(try await h.callState() == nil)
}

@Test func undecodablePushIsReportedAndEndedAsFailed() async {
    let h = Harness()
    await h.push(["callx": ["schemaVersion": 2]], mustReport: true)
    #expect(h.reporter.reported.count == 1)
    #expect(h.reporter.ended.map(\.1) == [.failed])
    #expect(h.listener.rejected.count == 1)
    #expect(h.listener.rejected.first?.0 == nil)
}

@Test func busyInvitationIsRecordedSoItCannotRingLater() async throws {
    let h = Harness()
    await h.push("call-1"); await h.push("call-3", mustReport: false)
    #expect(h.listener.rejected.last?.1 == .busy)
    try await h.ingress.remoteEnded(callID: "call-1")
    await h.push("call-3", mustReport: false)
    #expect(h.listener.rejected.last?.1 == .ended(reason: "busy"))
    #expect(h.listener.accepted == ["call-1"])
}

@Test func remoteEndEndsTheCallKitCall() async throws {
    let h = Harness()
    await h.push("call-1")
    try await h.ingress.remoteEnded(callID: "call-1", reason: "answeredElsewhere")
    #expect(h.reporter.ended.map(\.0) == [h.uuids.uuid(for: "call-1")])
    #expect(h.reporter.ended.map(\.1) == [.answeredElsewhere])
}

@Test func refusedReportLeavesNoRingingCall() async throws {
    let h = Harness()
    h.reporter.failReports = true
    await h.push("call-1")
    #expect(h.listener.accepted.isEmpty)
    #expect(h.listener.rejected.count == 1)
    #expect(try await h.callState() == .string("ended"))
}

@Test func ringTimerEndsTheCallKitCallAsUnanswered() async throws {
    let h = Harness(ringTimeoutMs: 50)
    await h.push("call-1")
    #expect(await eventually { h.listener.timedOut == ["call-1"] })
    #expect(h.reporter.ended.map(\.1) == [.unanswered])
    #expect(try await h.callState() == .string("ended"))
}

@Test func systemAnswerReachesTheCoordinator() async throws {
    let h = Harness()
    await h.push("call-1")
    let action = RecordingSystemAnswer(call: h.uuids.uuid(for: "call-1"))
    #expect(h.lifecycle.begin(action))
    h.lifecycle.applied(action)
    #expect(try await eventually { try await h.callState() == .string("connecting") })
}

private final class RecordingSystemMute: CXSetMutedCallAction, @unchecked Sendable {
    override func fulfill() {}
    override func fail() {}
}

@Test func systemMuteReachesTheCoordinator() async throws {
    let h = Harness()
    await h.push("call-1")
    let answer = RecordingSystemAnswer(call: h.uuids.uuid(for: "call-1"))
    #expect(h.lifecycle.begin(answer)); h.lifecycle.applied(answer)
    #expect(try await eventually { try await h.callState() == .string("connecting") })
    let mute = RecordingSystemMute(call: h.uuids.uuid(for: "call-1"), muted: true)
    #expect(h.lifecycle.begin(mute)); h.lifecycle.applied(mute)
    #expect(try await eventually {
        guard case .object(let call) = try await h.runtime.getSnapshot()["call"] else { return false }
        return call["muted"] == .bool(true)
    })
}

@Test func ingressImplementsBothPushKitCallbacks() {
    #expect(CallKitIngress.instancesRespond(to:
        #selector(PKPushRegistryDelegate.pushRegistry(_:didReceiveIncomingPushWith:for:completion:))))
    if #available(iOS 26.4, *) {
        #expect(CallKitIngress.instancesRespond(to:
            #selector(PKPushRegistryDelegate.pushRegistry(_:didReceiveIncomingVoIPPushWith:metadata:withCompletionHandler:))))
    }
}
#endif
