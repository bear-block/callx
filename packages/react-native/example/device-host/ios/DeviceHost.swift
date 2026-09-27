import CallKit
import Foundation
@preconcurrency import React
import callx_react_native

final class DeviceHost: NSObject, CallKitIngressListener, CallKitActionPerforming, @unchecked Sendable {
  static let shared = DeviceHost()
  private let lock = NSLock()
  private let uuids = CallUUIDMap()
  private var bootstrap: Task<Void, Error>?
  private var runtime: BridgeRuntime?
  private var ingress: CallKitIngress?
  private var provider: CXProvider?
  private var delegate: CallKitProviderDelegateAdapter?
  private var events: [String] = []

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
    let delegate = CallKitProviderDelegateAdapter(performer: self, lifecycle: lifecycle)
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
    bootstrap = Task {
      if let recovered = try await ingress.recoverAfterProcessDeath() {
        self.record("recovered \(recovered.callID): \(recovered.endReason ?? "failed")")
      }
      CallxReactNativeHost.configure(runtime)
      // This local-signaling harness does not register for push.
      self.record("runtime configured")
    }
  }

  func invoke(_ method: String, arguments: [String: Any]) async throws -> Any? {
    try await bootstrap?.value
    guard let runtime, let ingress else { throw DeviceHostError.notReady }
    let callID = arguments["callId"] as? String ?? ""
    switch method {
    case "status": return status()
    case "incoming":
      let invitation = Invitation(callID: callID, displayName: arguments["displayName"] as? String ?? "Caller",
        handle: arguments["handle"] as? String ?? "callx:caller")
      return await ingress.handleInvitation(invitation).map { "\($0)" }
    case "remoteAnswered": try await ingress.remoteAnswered(callID: callID)
    case "remoteEnded": try await ingress.remoteEnded(callID: callID, reason: arguments["reason"] as? String ?? "remoteEnded")
    case "mediaConnected":
      try await runtime.mediaConnected(callID: callID)
      record("media connected (simulated) for \(callID)")
    case "selectAudioEndpoint": return false
    default: throw DeviceHostError.unknownAction
    }
    return nil
  }

  private func status() -> [String: Any] {
    lock.lock(); defer { lock.unlock() }
    #if targetEnvironment(simulator)
    let simulator = true
    #else
    let simulator = false
    #endif
    return ["platform": "ios", "simulator": simulator, "pushReady": false,
      "events": events, "endpoints": [[String: Any]]()]
  }

  private func record(_ message: String) {
    let formatter = DateFormatter(); formatter.dateFormat = "HH:mm:ss"
    NSLog("CallxExample: %@", message)
    lock.lock(); events.insert("\(formatter.string(from: Date()))  \(message)", at: 0)
    if events.count > 40 { events.removeLast() }; lock.unlock()
  }

  // CallKitIngressListener
  func invitationAccepted(_ invitation: Invitation) { record("ringing \(invitation.callID) (\(invitation.displayName))") }
  func invitationRejected(_ invitation: Invitation?, outcome: IncomingOutcome?) {
    record("did not ring \(invitation?.callID ?? "undecodable payload"): \(outcome.map { "\($0)" } ?? "not recorded or refused by CallKit")")
  }
  func ringTimedOut(callID: String) { record("ring deadline passed: \(callID)") }

  // CallKitActionPerforming: a real app does its backend and media work before returning true.
  func perform(_ kind: CallKitActionKind, callUUID: UUID) async -> Bool {
    record("CallKit action \(kind) for \(uuids.callID(for: callUUID) ?? callUUID.uuidString)"); return true
  }
  func providerDidReset() async { record("CallKit provider reset") }
}

private enum DeviceHostError: Error { case notReady, unknownAction }

@objc(CallxDeviceHost)
final class DeviceHostModule: NSObject {
  @objc static func requiresMainQueueSetup() -> Bool { false }
  @objc func invoke(_ method: String, arguments: NSDictionary,
    resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    let request = DeviceHostRequest(method, arguments as? [String: Any] ?? [:], resolve, reject)
    Task {
      do { request.resolve(try await DeviceHost.shared.invoke(request.method, arguments: request.arguments)) }
      catch { request.reject("host", String(describing: error), error) }
    }
  }
}

private final class DeviceHostRequest: @unchecked Sendable {
  let method: String
  let arguments: [String: Any]
  let resolve: RCTPromiseResolveBlock
  let reject: RCTPromiseRejectBlock
  init(_ method: String, _ arguments: [String: Any], _ resolve: @escaping RCTPromiseResolveBlock,
    _ reject: @escaping RCTPromiseRejectBlock) {
    self.method = method; self.arguments = arguments; self.resolve = resolve; self.reject = reject
  }
}
