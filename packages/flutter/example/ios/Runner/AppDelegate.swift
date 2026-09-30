import AVFAudio
import CallKit
import Flutter
import UIKit
import callx

@main
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate {
  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    // Before PushKit can deliver the push that launched this process.
    CallHost.shared.start()
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {
    GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)
    if let registrar = engineBridge.pluginRegistry.registrar(forPlugin: "CallxExampleHost") {
      CallHost.shared.attachChannel(registrar.messenger())
    }
  }
}

/// Device-trial host. A real app connects its signaling client and media engine here. This one has
/// no signaling client: it records every callback and lets the example UI and the call console
/// stand in for the remote side. Media is real when the console and `npm run media:server` run:
/// `LiveKitCallMedia` joins the call's LiveKit room on answer. Set `CallxConsoleURL` in
/// Info.plist to the Mac's address for an iPhone (the default reaches the Mac from a Simulator).
final class CallHost: NSObject, CallKitIngressListener, CallKitActionPerforming, @unchecked Sendable {
  static let shared = CallHost()
  private let lock = NSLock()
  private let uuids = CallUUIDMap()
  private var bootstrap: Task<Void, Error>?
  private var runtime: BridgeRuntime?
  private var ingress: CallKitIngress?
  private var provider: CXProvider?
  private var delegate: CallKitProviderDelegateAdapter?
  private var channel: FlutterMethodChannel?
  private var pushToken: String?
  private var events: [String] = []
  private lazy var media = LiveKitCallMedia(
    credentials: { callID in try await CallHost.mediaCredentials(callID) },
    onConnected: { callID in Task { try? await CallHost.shared.runtime?.mediaConnected(callID: callID) } },
    onInterrupted: { callID in Task { try? await CallHost.shared.runtime?.mediaInterrupted(callID: callID) } },
    log: { CallHost.shared.record($0) })
  static let consoleURL = URL(string: Bundle.main.object(forInfoDictionaryKey: "CallxConsoleURL") as? String
    ?? "http://127.0.0.1:8787")!

  func start() {
    guard runtime == nil else { return }
    let nowMs: @Sendable () -> Int64 = { Int64(Date().timeIntervalSince1970 * 1000) }
    let configuration = CXProviderConfiguration()
    configuration.supportsVideo = false
    configuration.maximumCallGroups = 1
    configuration.maximumCallsPerCallGroup = 1
    configuration.supportedHandleTypes = [.generic]
    let provider = CXProvider(configuration: configuration)
    let actionIndex = CallKitActionIndex()
    let actionRegistry = PlatformActionRegistry()
    let lifecycle = CallKitActionLifecycle(index: actionIndex, registry: actionRegistry, nowMs: nowMs)
    let executor = RegistryBackedPlatformExecutor(
      submitter: CallKitTransactionSubmitter(resolver: uuids, index: actionIndex, nowMs: nowMs),
      registry: actionRegistry)
    let delegate = CallKitProviderDelegateAdapter(performer: self, lifecycle: lifecycle, audio: media)
    provider.setDelegate(delegate, queue: nil)
    let url = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
      .appendingPathComponent("callx/demo-account/coordinator.json")
    let coordinator: CallCoordinator
    do { coordinator = try CallCoordinator(store: CoordinatorFileStore(url: url)) } catch {
      record("checkpoint unreadable: \(error)"); return
    }
    let runtime = BridgeRuntime(coordinator: coordinator, executor: executor,
      capabilities: .init(accountGeneration: "demo-account-1", durableReplay: true,
        providerManagedSignaling: false, hold: true, mute: true), nowMs: nowMs)
    let ingress = CallKitIngress(runtime: runtime, reporter: provider, uuids: uuids,
      lifecycle: lifecycle, listener: self, nowMs: nowMs)
    self.provider = provider; self.delegate = delegate; self.runtime = runtime; self.ingress = ingress
    ConsoleReporter.start(consoleURL: Self.consoleURL, app: "flutter") { [weak self] in
      guard let self else { return (nil, []) }
      self.lock.lock(); defer { self.lock.unlock() }; return (self.pushToken, self.events)
    }
    bootstrap = Task {
      if let recovered = try await ingress.recoverAfterProcessDeath() {
        self.record("recovered \(recovered.callID): \(recovered.endReason ?? "failed")")
      }
      CallxPlugin.configure(runtime)
      ingress.startPushRegistry()
      self.record("runtime configured")
    }
  }

  func attachChannel(_ messenger: FlutterBinaryMessenger) {
    let channel = FlutterMethodChannel(name: "callx_example/host", binaryMessenger: messenger)
    channel.setMethodCallHandler { [weak self] call, result in self?.handle(call, result: result) }
    self.channel = channel
  }

  private func handle(_ call: FlutterMethodCall, result: @escaping FlutterResult) {
    // The example waits for this status channel before calling SDK setup.
    let box = ResultBox(result)
    Task { @MainActor in
      do {
        try await bootstrap?.value
        handleReady(call, result: result)
      } catch {
        box.send(FlutterError(code: "recoveryFailed", message: "\(error)", details: nil))
      }
    }
  }

  private func handleReady(_ call: FlutterMethodCall, result: @escaping FlutterResult) {
    let arguments = call.arguments as? [String: Any] ?? [:]
    let callID = arguments["callId"] as? String ?? ""
    guard let runtime, let ingress else {
      result(FlutterError(code: "host", message: "Runtime is not configured.", details: nil)); return
    }
    func reply(_ work: @escaping @Sendable () async throws -> Any?) {
      let box = ResultBox(result)
      Task {
        do { box.send(try await work()) }
        catch { box.send(FlutterError(code: "host", message: "\(error)", details: nil)) }
      }
    }
    switch call.method {
    case "status":
      lock.lock(); let token = pushToken; let recent = events; lock.unlock()
      #if targetEnvironment(simulator)
      let simulator = true
      #else
      let simulator = false
      #endif
      result(["platform": "ios", "simulator": simulator, "pushReady": token != nil, "pushToken": token as Any,
        "events": recent, "endpoints": [[String: Any]]()])
    case "requestPermissions":
      // Ask while the app is in use: a call answered on the lock screen cannot show the prompt.
      Task { self.record("microphone \(await LiveKitCallMedia.requestMicrophone() ? "allowed" : "denied")") }
      result(nil)
    case "incoming":
      let name = arguments["displayName"] as? String ?? "Caller"
      reply { await ingress.handleInvitation(Invitation(callID: callID, displayName: name, handle: "callx:\(name)"))
        .map { "\($0)" } }
    case "remoteAnswered": reply { try await ingress.remoteAnswered(callID: callID); return nil }
    case "remoteEnded":
      let reason = arguments["reason"] as? String ?? "remoteEnded"
      reply { try await ingress.remoteEnded(callID: callID, reason: reason); return nil }
    case "mediaConnected":
      reply {
        try await runtime.mediaConnected(callID: callID)
        self.record("media connected (simulated) for \(callID)"); return nil
      }
    case "selectAudioEndpoint": result(false)
    default: result(FlutterMethodNotImplemented)
    }
  }

  /// Test harness only: the call console issues LiveKit tokens as a backend would.
  static func mediaCredentials(_ callID: String) async throws -> MediaCredentials {
    var request = URLRequest(url: consoleURL.appendingPathComponent("api/media-token"), timeoutInterval: 3)
    request.httpMethod = "POST"; request.setValue("application/json", forHTTPHeaderField: "content-type")
    request.httpBody = try JSONSerialization.data(withJSONObject: ["callId": callID, "identity": "callee",
      "name": UIDevice.current.name])
    let (data, response) = try await URLSession.shared.data(for: request)
    guard (response as? HTTPURLResponse)?.statusCode == 200,
          let body = try JSONSerialization.jsonObject(with: data) as? [String: Any],
          let url = body["url"] as? String, let token = body["token"] as? String else {
      throw URLError(.badServerResponse)
    }
    return MediaCredentials(url: url, token: token)
  }

  private func record(_ message: String) {
    let formatter = DateFormatter(); formatter.dateFormat = "HH:mm:ss"
    NSLog("CallxExample: %@", message)
    lock.lock(); events.insert("\(formatter.string(from: Date()))  \(message)", at: 0)
    if events.count > 40 { events.removeLast() }; lock.unlock()
  }

  // CallKitIngressListener
  func pushTokenUpdated(_ token: Data) {
    let hex = token.map { String(format: "%02x", $0) }.joined()
    lock.lock(); pushToken = hex; lock.unlock(); record("VoIP token ready")
  }
  func pushTokenInvalidated() { lock.lock(); pushToken = nil; lock.unlock(); record("VoIP token invalidated") }
  func invitationAccepted(_ invitation: Invitation) { record("ringing \(invitation.callID) (\(invitation.displayName))") }
  func invitationRejected(_ invitation: Invitation?, outcome: IncomingOutcome?) {
    record("did not ring \(invitation?.callID ?? "undecodable payload"): \(outcome.map { "\($0)" } ?? "not recorded or refused by CallKit")")
  }
  func ringTimedOut(callID: String) { record("ring deadline passed: \(callID)") }
  func callAnswered(callID: String) { record("answered: \(callID)"); media.start(callID: callID) }
  func callEnded(callID: String) { record("ended: \(callID)"); media.stop(callID: callID) }

  // CallKitActionPerforming: a real app does its backend and media work before returning true.
  func perform(_ kind: CallKitActionKind, callUUID: UUID) async -> Bool {
    let callID = uuids.callID(for: callUUID) ?? callUUID.uuidString
    record("CallKit action \(kind) for \(callID)")
    if case .setMuted(let muted) = kind { return await media.setMuted(callID: callID, muted: muted) }
    return true
  }
  func providerDidReset() async { record("CallKit provider reset") }
}

private final class ResultBox: @unchecked Sendable {
  private let result: FlutterResult
  init(_ result: @escaping FlutterResult) { self.result = result }
  func send(_ value: Any?) { DispatchQueue.main.async { self.result(value) } }
}
