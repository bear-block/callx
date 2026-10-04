#if os(iOS)
import AVFAudio
import CallKit
import Foundation
import Intents
import Testing
@testable import CallxCore

// ADR-0013 on iOS: route mapping, CallKit keypad and rename, connecting, call requests.

private func port(_ type: AVAudioSession.Port, _ uid: String, _ name: String) -> CallxAudioPort {
    CallxAudioPort(type: type, uid: uid, name: name)
}

@Test func aPhoneListsEarpieceSpeakerAndHeadsets() {
    let described = CallxAudioRoutes.describe(outputs: [port(.builtInReceiver, "rx", "Receiver")],
        inputs: [port(.builtInMic, "mic", "iPhone Microphone"), port(.bluetoothHFP, "bt-1", "AirPods"),
            port(.carAudio, "car", "CarPlay")], isPhone: true)
    #expect(described.routes.map(\.id) == ["earpiece", "speaker", "bt-1", "car"])
    #expect(described.routes.map(\.kind) == [.earpiece, .speaker, .bluetooth, .other])
    #expect(described.current == "earpiece")
}

@Test func aWiredHeadsetReplacesTheEarpiece() {
    let described = CallxAudioRoutes.describe(outputs: [port(.headphones, "wired-out", "Headphones")],
        inputs: [port(.headsetMic, "wired-in", "Headset Microphone")], isPhone: true)
    #expect(described.routes.map(\.id) == ["speaker", "wired-in"])
    #expect(described.current == "wired-in")
    let headphones = CallxAudioRoutes.describe(outputs: [port(.headphones, "wired-out", "Headphones")], inputs: [],
        isPhone: true)
    #expect(headphones.routes.map(\.id) == ["speaker", "wired-out"])
    #expect(headphones.current == "wired-out")
}

@Test func anOutputWithoutAnInputBecomesItsOwnRoute() {
    let described = CallxAudioRoutes.describe(outputs: [port(.bluetoothA2DP, "a2dp", "Speaker Box")], inputs: [],
        isPhone: false)
    #expect(described.routes.map(\.id) == ["speaker", "a2dp"])
    #expect(described.current == "a2dp")
    let headset = CallxAudioRoutes.describe(outputs: [port(.bluetoothHFP, "bt-1", "AirPods")],
        inputs: [port(.bluetoothHFP, "bt-1", "AirPods")], isPhone: true)
    #expect(headset.current == "bt-1")
    #expect(headset.routes.count == 3)
}

@Test func anINStartCallIntentBecomesACallRequest() {
    let person = INPerson(personHandle: INPersonHandle(value: "+84901", type: .unknown), nameComponents: nil,
        displayName: "hao.dev7", image: nil, contactIdentifier: nil, customIdentifier: nil)
    let video = INStartCallIntent(callRecordFilter: nil, callRecordToCallBack: nil, audioRoute: .unknown,
        destinationType: .normal, contacts: [person], callCapability: .videoCall)
    #expect(CallxCallRequests.request(from: video, nowMs: 5) ==
        CallxCallRequest(handle: "+84901", displayName: "hao.dev7", video: true, requestedAtMs: 5))
    let nameless = INPerson(personHandle: INPersonHandle(value: nil, type: .unknown), nameComponents: nil,
        displayName: "Alex", image: nil, contactIdentifier: nil, customIdentifier: nil)
    #expect(CallxCallRequests.request(from: INStartCallIntent(callRecordFilter: nil, callRecordToCallBack: nil,
        audioRoute: .unknown, destinationType: .normal, contacts: [nameless], callCapability: .audioCall), nowMs: 5) == nil)
    #expect(!CallxCallRequests.handle(NSUserActivity(activityType: "com.example.other")))
}

@Test func aCallRequestIsDeliveredOnceAndExpires() {
    let signals = Counter()
    CallxCallRequests.setListener(nil)
    _ = CallxCallRequests.take()
    CallxCallRequests.offer(CallxCallRequest(handle: "+84901", displayName: nil, video: false, requestedAtMs: 1_000))
    CallxCallRequests.setListener { signals.increment() }
    #expect(signals.value == 1)
    #expect(CallxCallRequests.take(nowMs: 1_500)?.handle == "+84901")
    #expect(CallxCallRequests.take(nowMs: 1_600) == nil)
    CallxCallRequests.offer(CallxCallRequest(handle: "+84902", displayName: nil, video: true, requestedAtMs: 1_000))
    #expect(signals.value == 2)
    #expect(CallxCallRequests.take(nowMs: 1_000 + CallxCallRequests.retentionMs) == nil)
    CallxCallRequests.setListener(nil)
    CallxCallRequests.offer(CallxCallRequest(handle: "late", displayName: nil, video: false, requestedAtMs: 2_000))
    CallxCallRequests.setListener({ signals.increment() }, notifyPending: false)
    #expect(signals.value == 2)
    #expect(CallxCallRequests.take(nowMs: 2_100)?.handle == "late")
    CallxCallRequests.setListener(nil)
}

private final class Counter: @unchecked Sendable {
    private let lock = NSLock(); private var count = 0
    var value: Int { lock.withLock { count } }
    func increment() { lock.withLock { count += 1 } }
}

private final class ToneAdapter: CallxMediaAdapter, CallxDTMFAdapter, @unchecked Sendable {
    private let lock = NSLock(); private var _tones: [String] = []
    var tones: [String] { lock.withLock { _tones } }
    var sent = true
    func start(callID: String, sink: any CallxMediaSink) {}
    func stop(callID: String) {}
    func setMuted(callID: String, muted: Bool) async -> Bool { true }
    func didActivate(_ session: AVAudioSession) {}
    func didDeactivate(_ session: AVAudioSession) {}
    func sendDTMF(callID: String, digits: String) async -> Bool { lock.withLock { _tones.append(digits) }; return sent }
}

private struct Accepting: CallKitActionPerforming {
    func perform(_ kind: CallKitActionKind, callUUID: UUID) async -> Bool { true }
    func providerDidReset() async {}
}

@Test func theCallKitKeypadSendsOnlyDigitsThroughTheAdapter() async {
    let adapter = ToneAdapter(); let uuids = CallUUIDMap()
    let performer = MediaRoutingPerformer(performer: Accepting(), media: adapter, uuids: uuids)
    #expect(await performer.perform(.playDTMF("1,2w#"), callUUID: uuids.uuid(for: "call-1")))
    #expect(adapter.tones == ["12#"])
    adapter.sent = false
    #expect(await !performer.perform(.playDTMF("3"), callUUID: uuids.uuid(for: "call-1")))
    #expect(await !performer.perform(.playDTMF("4"), callUUID: UUID()), "an unknown call cannot take tones")
}

private struct Inner: PlatformCommandExecutor {
    func perform(_ command: NativeCommand) async -> PlatformOutcome { .applied(completedAtMs: 1) }
}
private final class Renames: @unchecked Sendable {
    private let lock = NSLock(); private var _names: [String] = []
    var names: [String] { lock.withLock { _names } }
    func add(_ value: String) { lock.withLock { _names.append(value) } }
}

@Test func theFeatureExecutorRoutesTonesAndNames() async {
    let renames = Renames(); let adapter = ToneAdapter()
    let executor = CallxCallFeatureExecutor(inner: Inner(), dtmf: adapter, routes: nil,
        rename: { renames.add("\($0):\($1)") }, nowMs: { 7 })
    #expect(await executor.perform(NativeCommand(operationID: "t", type: .sendDtmf, callID: "call-1", deadlineAtMs: 9,
        digits: "5")) == .applied(completedAtMs: 7))
    #expect(await executor.perform(NativeCommand(operationID: "n", type: .setDisplayName, callID: "call-1",
        displayName: "Front desk", deadlineAtMs: 9)) == .applied(completedAtMs: 7))
    #expect(renames.names == ["call-1:Front desk"])
    #expect(await executor.perform(NativeCommand(operationID: "r", type: .setAudioRoute, callID: "call-1", deadlineAtMs: 9,
        audioRoute: "speaker")) == .rejected(errorCode: "unsupported", completedAtMs: 7))
    let silent = CallxCallFeatureExecutor(inner: Inner(), dtmf: nil, routes: nil, rename: { _, _ in }, nowMs: { 7 })
    #expect(await silent.perform(NativeCommand(operationID: "t", type: .sendDtmf, callID: "call-1", deadlineAtMs: 9,
        digits: "5")) == .rejected(errorCode: "unsupported", completedAtMs: 7))
}

private final class ConnectingReporter: CallKitIncomingReporting, @unchecked Sendable {
    private let lock = NSLock()
    private var _connecting = 0; private var _names: [String?] = []
    var connecting: Int { lock.withLock { _connecting } }
    var names: [String?] { lock.withLock { _names } }
    func reportNewIncomingCall(with uuid: UUID, update: CXCallUpdate) async throws {}
    func reportCall(with uuid: UUID, endedAt: Date?, reason: CXCallEndedReason) {}
    func reportOutgoingCall(with uuid: UUID, connectedAt: Date?) {}
    func reportOutgoingCall(with uuid: UUID, startedConnectingAt: Date?) { lock.withLock { _connecting += 1 } }
    func reportCall(with uuid: UUID, updated update: CXCallUpdate) { lock.withLock { _names.append(update.localizedCallerName) } }
}

@Test func aStartedOutgoingCallReportsConnectingAndRenamesReachCallKit() async throws {
    let reporter = ConnectingReporter(); let uuids = CallUUIDMap()
    let index = CallKitActionIndex(); let registry = PlatformActionRegistry()
    let lifecycle = CallKitActionLifecycle(index: index, registry: registry, nowMs: { 1 })
    let runtime = BridgeRuntime(coordinator: CallCoordinator(), executor: Inner(), capabilities: BridgeCapabilities(
        accountGeneration: "g", durableReplay: true, providerManagedSignaling: false, hold: true, mute: true), nowMs: { 1 })
    let ingress = CallKitIngress(runtime: runtime, reporter: reporter, uuids: uuids, lifecycle: lifecycle, nowMs: { 1 })
    let start = CXStartCallAction(call: uuids.uuid(for: "call-1"), handle: CXHandle(type: .generic, value: "+84901"))
    #expect(lifecycle.begin(start))
    lifecycle.applied(start)
    #expect(reporter.connecting == 1)
    ingress.rename(callID: "call-1", displayName: "Front desk")
    #expect(reporter.names == ["Front desk"])
}
#endif
