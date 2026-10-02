import AVFoundation
import AVFAudio
import CallKit
import Foundation
@preconcurrency import React
import UIKit
import callx_livekit
import callx_react_native

/// Device-trial host. Local signaling only (no push); media is real when the call console and
/// `npm run media:server` run: the callx-livekit adapter joins the call's LiveKit room on answer. Set
/// `CallxConsoleURL` in Info.plist to the Mac's address for an iPhone.
final class DeviceHost: NSObject, CallKitIngressListener, CallKitActionPerforming, @unchecked Sendable {
  static let shared = DeviceHost()
  private let lock = NSLock()
  private var uuids = CallUUIDMap()
  private var bootstrap: Task<Void, Error>?
  private var runtime: BridgeRuntime?
  private var ingress: CallKitIngress?
  private var events: [String] = []
  static let consoleURL = URL(string: Bundle.main.object(forInfoDictionaryKey: "CallxConsoleURL") as? String
    ?? "http://127.0.0.1:8787")!

  func start() {
    guard runtime == nil else { return }
    // The call console stands in for the app's token endpoint. Apps usually configure this from
    // JavaScript after sign-in (configureLiveKit); it persists for killed-app answers.
    try? CallxLiveKit.configure(tokenURL: Self.consoleURL.appendingPathComponent("api/media-token"))
    // The whole native pipeline in one call (ADR-0009); callx-livekit is discovered from
    // Info.plist CallxMediaAdapterFactories (its Expo plugin adds it).
    var config = CallxBootstrapConfig()
    config.accountGeneration = "demo-account-1"
    config.checkpointURL = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
      .appendingPathComponent("callx/demo-account/coordinator.json")
    config.listener = self
    config.performer = self
    config.startPushRegistry = false
    config.log = { DeviceHost.shared.record($0) }
    let started: CallxBootstrap
    do { started = try CallxReactNativeHost.bootstrap(config) } catch { record("bootstrap failed: \(error)"); return }
    runtime = started.runtime; ingress = started.ingress; uuids = started.uuids
    ConsoleReporter.start(consoleURL: Self.consoleURL, app: "react-native") { [weak self] in
      guard let self else { return (nil, []) }
      self.lock.lock(); defer { self.lock.unlock() }; return (nil, self.events)
    }
    bootstrap = Task {
      if let recovered = try await started.ready.value {
        self.record("recovered \(recovered.callID): \(recovered.endReason ?? "failed")")
      }
      self.record("runtime configured, media: \(started.media)")
    }
  }

  func invoke(_ method: String, arguments: [String: Any]) async throws -> Any? {
    try await bootstrap?.value
    guard let runtime, let ingress else { throw DeviceHostError.notReady }
    let callID = arguments["callId"] as? String ?? ""
    switch method {
    case "status": return status()
    case "requestPermissions":
      // Ask while the app is in use: a call answered on the lock screen cannot show the prompt.
      let granted = await LiveKitMediaAdapter.requestMicrophone()
      record("microphone \(granted ? "allowed" : "denied")")
    case "requestCameraPermission":
      let granted = await AVCaptureDevice.requestAccess(for: .video)
      record("camera \(granted ? "allowed" : "denied")")
    case "incoming":
      let invitation = Invitation(callID: callID, displayName: arguments["displayName"] as? String ?? "Caller",
        handle: arguments["handle"] as? String ?? "callx:caller",
        video: arguments["video"] as? Bool ?? false)
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
  func callAnswered(callID: String) { record("answered: \(callID)") }
  func callEnded(callID: String) { record("ended: \(callID)") }

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
