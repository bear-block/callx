#if os(iOS)
@preconcurrency import AVFAudio
import Foundation
@preconcurrency import Intents
import UIKit

/// A port as `AVAudioSession` describes it; plain values so route mapping can be tested.
struct CallxAudioPort: Equatable, Sendable {
    let type: AVAudioSession.Port
    let uid: String
    let name: String
}

/// Lists and switches the call's audio outputs on iOS (ADR-0013). CallKit activates the session,
/// so routes are reported only between `didActivate` and `didDeactivate`; switching uses the
/// speaker override and the preferred input, never a category change.
public final class CallxAudioRoutes: @unchecked Sendable {
    static let earpiece = "earpiece"
    static let speaker = "speaker"
    private let session: AVAudioSession
    private let isPhone: Bool
    private let lock = NSLock()
    private var active = false
    private var report: (@Sendable (_ current: String?, _ routes: [AudioRoute]) -> Void)?
    private var observer: (any NSObjectProtocol)?

    public init(session: AVAudioSession = .sharedInstance(), isPhone: Bool = CallxAudioRoutes.deviceHasEarpiece()) {
        self.session = session; self.isPhone = isPhone
        observer = NotificationCenter.default.addObserver(forName: AVAudioSession.routeChangeNotification,
            object: session, queue: nil) { [weak self] _ in self?.publish() }
    }
    deinit { observer.map(NotificationCenter.default.removeObserver) }

    /// Receives the routes while the call's session is active.
    func onChange(_ value: @escaping @Sendable (_ current: String?, _ routes: [AudioRoute]) -> Void) {
        lock.withLock { report = value }
    }
    func activated() { lock.withLock { active = true }; publish() }
    func deactivated() { lock.withLock { active = false } }

    func publish() {
        guard let report = lock.withLock({ active ? report : nil }) else { return }
        let described = Self.describe(outputs: session.currentRoute.outputs.map(Self.port),
            inputs: (session.availableInputs ?? []).map(Self.port), isPhone: isPhone)
        report(described.current, described.routes)
    }

    /// Moves call audio to the route `id`. False when the route is gone or the session refused.
    func select(_ id: String) -> Bool {
        do {
            switch id {
            case Self.speaker:
                try session.overrideOutputAudioPort(.speaker)
            case Self.earpiece:
                try session.overrideOutputAudioPort(.none)
                if let microphone = session.availableInputs?.first(where: { $0.portType == .builtInMic }) {
                    try session.setPreferredInput(microphone)
                }
            default:
                try session.overrideOutputAudioPort(.none)
                if let input = session.availableInputs?.first(where: { $0.uid == id }) {
                    try session.setPreferredInput(input)
                } else if !session.currentRoute.outputs.contains(where: { $0.uid == id }) {
                    return false
                }
            }
            return true
        } catch { return false }
    }

    /// Only iPhones have an earpiece. Read from the model identifier, which needs no main thread.
    public static func deviceHasEarpiece() -> Bool {
        if let simulated = ProcessInfo.processInfo.environment["SIMULATOR_MODEL_IDENTIFIER"] { return simulated.hasPrefix("iPhone") }
        var info = utsname()
        uname(&info)
        let machine = withUnsafeBytes(of: &info.machine) { String(decoding: $0.prefix { $0 != 0 }, as: UTF8.self) }
        return machine.hasPrefix("iPhone")
    }

    private static func port(_ value: AVAudioSessionPortDescription) -> CallxAudioPort {
        CallxAudioPort(type: value.portType, uid: value.uid, name: value.portName)
    }

    static func kind(of type: AVAudioSession.Port) -> AudioRouteKind? {
        switch type {
        case .builtInReceiver: .earpiece
        case .builtInSpeaker: .speaker
        case .bluetoothHFP, .bluetoothA2DP, .bluetoothLE: .bluetooth
        case .headsetMic, .headphones, .usbAudio: .wired
        case .carAudio, .airPlay, .HDMI, .lineOut: .other
        default: nil
        }
    }

    /// The routes a call can use: the earpiece (phones without a wired headset), the speaker, each
    /// headset or car input, and the current output when it has no input (AirPlay, A2DP).
    static func describe(outputs: [CallxAudioPort], inputs: [CallxAudioPort], isPhone: Bool)
        -> (current: String?, routes: [AudioRoute]) {
        var routes: [AudioRoute] = []
        let wired = inputs.contains { $0.type == .headsetMic } || outputs.contains { $0.type == .headphones }
        if isPhone, !wired { routes.append(AudioRoute(id: earpiece, kind: .earpiece, name: "iPhone")) }
        routes.append(AudioRoute(id: speaker, kind: .speaker, name: "Speaker"))
        for input in inputs where input.type != .builtInMic {
            guard let kind = kind(of: input.type), !routes.contains(where: { $0.id == input.uid }) else { continue }
            routes.append(AudioRoute(id: input.uid, kind: kind, name: input.name))
        }
        guard let output = outputs.first, let kind = kind(of: output.type) else { return (nil, routes) }
        switch output.type {
        case .builtInReceiver: return (routes.contains { $0.id == earpiece } ? earpiece : nil, routes)
        case .builtInSpeaker: return (speaker, routes)
        default:
            // A headset's output and input usually share a uid or a name; a wired headset is one
            // device even when they do not.
            if let match = routes.first(where: { $0.id == output.uid || ($0.kind == kind && $0.name == output.name) })
                ?? routes.first(where: { kind == .wired && $0.kind == .wired }) {
                return (match.id, routes)
            }
            routes.append(AudioRoute(id: output.uid, kind: kind, name: output.name))
            return (output.uid, routes)
        }
    }
}

/// Session callbacks for the media adapter or host, plus route reporting while the session is active.
final class RouteObservingAudioSession: CallKitAudioSessionHandling, @unchecked Sendable {
    private let inner: (any CallKitAudioSessionHandling)?
    private let routes: CallxAudioRoutes
    init(inner: (any CallKitAudioSessionHandling)?, routes: CallxAudioRoutes) { self.inner = inner; self.routes = routes }
    func didActivate(_ audioSession: AVAudioSession) { inner?.didActivate(audioSession); routes.activated() }
    func didDeactivate(_ audioSession: AVAudioSession) { routes.deactivated(); inner?.didDeactivate(audioSession) }
}

/// Performs `setAudioRoute`, `sendDtmf` and `setDisplayName` (ADR-0013) and passes every other
/// command to `inner`.
public final class CallxCallFeatureExecutor: PlatformCommandExecutor, @unchecked Sendable {
    private let inner: any PlatformCommandExecutor
    private let dtmf: (any CallxDTMFAdapter)?
    private let routes: CallxAudioRoutes?
    private let rename: @Sendable (_ callID: String, _ displayName: String) -> Void
    private let nowMs: @Sendable () -> Int64
    public init(inner: any PlatformCommandExecutor, dtmf: (any CallxDTMFAdapter)?, routes: CallxAudioRoutes?,
        rename: @escaping @Sendable (_ callID: String, _ displayName: String) -> Void,
        nowMs: @escaping @Sendable () -> Int64) {
        self.inner = inner; self.dtmf = dtmf; self.routes = routes; self.rename = rename; self.nowMs = nowMs
    }

    public func perform(_ command: NativeCommand) async -> PlatformOutcome {
        switch command.type {
        case .setAudioRoute:
            guard let routes, let id = command.audioRoute else { return .rejected(errorCode: "unsupported", completedAtMs: nowMs()) }
            return routes.select(id) ? .applied(completedAtMs: nowMs()) : .rejected(errorCode: "platformRejected", completedAtMs: nowMs())
        case .sendDtmf:
            guard let dtmf else { return .rejected(errorCode: "unsupported", completedAtMs: nowMs()) }
            guard let digits = command.digits else { return .rejected(errorCode: "invalidArgument", completedAtMs: nowMs()) }
            return await dtmf.sendDTMF(callID: command.callID, digits: digits)
                ? .applied(completedAtMs: nowMs()) : .rejected(errorCode: "mediaNotReady", completedAtMs: nowMs())
        case .setDisplayName:
            guard let name = command.displayName else { return .rejected(errorCode: "invalidArgument", completedAtMs: nowMs()) }
            rename(command.callID, name)
            return .applied(completedAtMs: nowMs())
        default:
            return await inner.perform(command)
        }
    }
}

/// The user asked the system to call someone through this app: from Recents, a contact card,
/// a Siri suggestion or Siri (ADR-0013). It is not a command: look up `handle` and call
/// `startCall` if the app agrees.
public struct CallxCallRequest: Equatable, Sendable {
    public let handle: String
    /// The name the system showed, when it has one.
    public let displayName: String?
    /// The user asked for a video call.
    public let video: Bool
    public let requestedAtMs: Int64
    public init(handle: String, displayName: String?, video: Bool, requestedAtMs: Int64) {
        self.handle = handle; self.displayName = displayName; self.video = video; self.requestedAtMs = requestedAtMs
    }
}

/// Holds the latest call request until the app takes it, for `retentionMs`, so a request that
/// launched the app is still delivered once Dart or JavaScript starts.
public enum CallxCallRequests {
    public static let retentionMs: Int64 = 60_000
    private static let lock = NSLock()
    nonisolated(unsafe) private static var pending: CallxCallRequest?
    nonisolated(unsafe) private static var listener: (@Sendable () -> Void)?

    /// Call from `application(_:continue:restorationHandler:)` and `scene(_:continue:)`, and with
    /// each `userActivities` entry of a scene's connection options. True when the activity was a
    /// call request, which is then held for the app.
    @discardableResult
    public static func handle(_ activity: NSUserActivity) -> Bool {
        guard let request = request(from: activity) else { return false }
        offer(request)
        return true
    }

    /// The call request an `INStartCallIntent` activity carries, if it names a handle.
    public static func request(from activity: NSUserActivity,
        nowMs: Int64 = Int64(Date().timeIntervalSince1970 * 1000)) -> CallxCallRequest? {
        guard let intent = activity.interaction?.intent as? INStartCallIntent else { return nil }
        return request(from: intent, nowMs: nowMs)
    }

    static func request(from intent: INStartCallIntent, nowMs: Int64) -> CallxCallRequest? {
        guard let person = intent.contacts?.first, let handle = person.personHandle?.value, !handle.isEmpty else { return nil }
        let name = person.displayName
        return CallxCallRequest(handle: handle, displayName: name.isEmpty || name == handle ? nil : name,
            video: intent.callCapability == .videoCall, requestedAtMs: nowMs)
    }

    /// Records `request`, replacing an untaken one, and tells the listener.
    public static func offer(_ request: CallxCallRequest) {
        let notify = lock.withLock { pending = request; return listener }
        notify?()
    }

    /// The pending request, removed so it is delivered once; nil when none or too old.
    public static func take(nowMs: Int64 = Int64(Date().timeIntervalSince1970 * 1000)) -> CallxCallRequest? {
        lock.withLock {
            defer { pending = nil }
            return pending.flatMap { nowMs - $0.requestedAtMs < retentionMs ? $0 : nil }
        }
    }

    /// One consumer, the framework plugin: told when a request arrives, then calls `take`.
    public static func setListener(_ value: (@Sendable () -> Void)?, notifyPending: Bool = true) {
        let notify = lock.withLock { listener = value; return pending == nil || !notifyPending ? nil : value }
        notify?()
    }

    /// Lets the system suggest calling this person back through the app (Siri suggestions,
    /// contact cards). Called once per answered call unless `CallxBootstrapConfig.donateCalls` is false.
    static func donate(_ call: CallRecord) {
        guard let handle = call.handle, let name = call.displayName, let direction = call.direction else { return }
        let person = INPerson(personHandle: INPersonHandle(value: handle, type: .unknown), nameComponents: nil,
            displayName: name, image: nil, contactIdentifier: nil, customIdentifier: handle)
        let intent = INStartCallIntent(callRecordFilter: nil, callRecordToCallBack: nil, audioRoute: .unknown,
            destinationType: .normal, contacts: [person], callCapability: call.video ? .videoCall : .audioCall)
        let interaction = INInteraction(intent: intent, response: nil)
        interaction.direction = direction == .incoming ? .incoming : .outgoing
        interaction.donate(completion: nil)
    }
}

/// Handles "call … with <app>" from Siri inside the app (no Intents extension): return it from
/// `application(_:handlerFor:)` for `INStartCallIntent`, list `INStartCallIntent` under
/// `INIntentsSupported`, and enable the Siri capability. Siri then opens the app with an activity
/// that `CallxCallRequests.handle` turns into a call request. Unverified on a physical iPhone.
public final class CallxStartCallIntentHandler: NSObject, INStartCallIntentHandling {
    public func resolveContacts(for intent: INStartCallIntent,
        with completion: @escaping ([INStartCallContactResolutionResult]) -> Void) {
        guard let contacts = intent.contacts, !contacts.isEmpty else { completion([.needsValue()]); return }
        // Only people the app knows by handle, for example from donated calls, can be called.
        completion(contacts.map { $0.personHandle?.value?.isEmpty == false ? .success(with: $0) : .unsupported() })
    }
    public func resolveCallCapability(for intent: INStartCallIntent,
        with completion: @escaping (INStartCallCallCapabilityResolutionResult) -> Void) {
        completion(.success(with: intent.callCapability == .videoCall ? .videoCall : .audioCall))
    }
    public func resolveDestinationType(for intent: INStartCallIntent,
        with completion: @escaping (INCallDestinationTypeResolutionResult) -> Void) {
        completion(.success(with: .normal))
    }
    public func handle(intent: INStartCallIntent, completion: @escaping (INStartCallIntentResponse) -> Void) {
        // The system attaches the interaction, so the app receives the same activity as from Recents.
        completion(INStartCallIntentResponse(code: .continueInApp,
            userActivity: nil))
    }
}
#endif
