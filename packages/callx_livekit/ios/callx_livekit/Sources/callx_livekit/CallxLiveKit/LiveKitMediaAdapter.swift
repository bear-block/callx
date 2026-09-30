#if os(iOS)
import AVFAudio
import Foundation
import LiveKit
// One canonical source serves every package; the Callx Swift module is named per framework.
#if canImport(callx)
import callx
#elseif canImport(callx_react_native)
import callx_react_native
#else
import CallxCore
#endif

/// LiveKit media adapter: one LiveKit room per call, joined when the call is answered and left
/// when it ends. It follows ADR-0004 and Apple's CallKit rules: CallKit owns the audio session,
/// so LiveKit's automatic session configuration is off and its audio engine may run only between
/// `didActivate` and `didDeactivate`. Joining the room and publishing the microphone can happen
/// earlier; audio starts when CallKit activates the session. It implements `CallxMediaAdapter`
/// (ADR-0009): the ingress starts and stops it, and it reports readiness and interruptions
/// through the call's sink, never a call end.
public final class LiveKitMediaAdapter: NSObject, CallxMediaAdapter, @unchecked Sendable {
  private let credentials: @Sendable (String) async throws -> LiveKitCredentials
  private let log: @Sendable (String) -> Void
  private let lock = NSLock()
  private var sessions: [String: Session] = [:]

  public init(credentials: @escaping @Sendable (String) async throws -> LiveKitCredentials,
       log: @escaping @Sendable (String) -> Void) {
    self.credentials = credentials; self.log = log
    super.init()
    // Before any room exists: CallKit, not LiveKit, activates the audio session.
    AudioManager.shared.audioSession.isAutomaticConfigurationEnabled = false
    do { try AudioManager.shared.setEngineAvailability(.none) }
    catch { log("media: could not hold the audio engine for CallKit: \(error)") }
  }

  /// Joins the call's room. Returns at once; idempotent per call.
  public func start(callID: String, sink: any CallxMediaSink) {
    lock.lock()
    guard sessions[callID] == nil else { lock.unlock(); return }
    let session = Session(callID: callID, sink: sink, owner: self)
    sessions[callID] = session
    lock.unlock()
    session.task = Task { [weak self] in
      guard let self else { return }
      do {
        let credentials = try await self.credentials(callID)
        try Task.checkCancellation()
        try await session.room.connect(url: credentials.url, token: credentials.token)
        self.log("media: joined the room of \(callID)")
        await self.enableMicrophone(session, enabled: !session.muted)
      } catch is CancellationError {
      } catch {
        self.log("media failed for \(callID): \(error)")
      }
    }
  }

  /// Leaves the call's room.
  public func stop(callID: String) {
    lock.lock(); let session = sessions.removeValue(forKey: callID); lock.unlock()
    guard let session else { return }
    session.task?.cancel()
    Task { await session.room.disconnect() }
  }

  /// Mute from the app or from CallKit. Before joining, applies on join.
  public func setMuted(callID: String, muted: Bool) async -> Bool {
    guard let session = lock.withLock({ sessions[callID] }) else { return false }
    session.muted = muted
    guard session.room.connectionState == .connected else { return true }
    return await enableMicrophone(session, enabled: !muted)
  }

  @discardableResult
  private func enableMicrophone(_ session: Session, enabled: Bool) async -> Bool {
    // Without permission the call stays connected and this device only listens.
    if enabled, !Self.microphoneAllowed {
      log("media: no microphone permission for \(session.callID); listening only")
      return false
    }
    do {
      try await session.room.localParticipant.setMicrophone(enabled: enabled)
      log("media: microphone \(enabled ? "on" : "muted") for \(session.callID)"); return true
    } catch {
      log("media: microphone failed for \(session.callID): \(error)"); return false
    }
  }

  public static var microphoneAllowed: Bool {
    if #available(iOS 17.0, *) { return AVAudioApplication.shared.recordPermission == .granted }
    return AVAudioSession.sharedInstance().recordPermission == .granted
  }

  /// Ask while the app is in use: a call answered on the lock screen cannot show the prompt.
  public static func requestMicrophone() async -> Bool {
    if #available(iOS 17.0, *) { return await AVAudioApplication.requestRecordPermission() }
    return await withCheckedContinuation { continuation in
      AVAudioSession.sharedInstance().requestRecordPermission { continuation.resume(returning: $0) }
    }
  }

  fileprivate func isCurrent(_ session: Session) -> Bool {
    lock.lock(); defer { lock.unlock() }
    return sessions[session.callID] === session
  }

  // CallKitAudioSessionHandling: runs on the CXProvider delegate queue.
  public func didActivate(_ audioSession: AVAudioSession) {
    do {
      try audioSession.setCategory(.playAndRecord, mode: .voiceChat)
      try AudioManager.shared.setEngineAvailability(.default)
      log("media: CallKit activated audio")
    } catch { log("media: could not start audio after CallKit activation: \(error)") }
  }

  public func didDeactivate(_ audioSession: AVAudioSession) {
    do { try AudioManager.shared.setEngineAvailability(.none) }
    catch { log("media: could not stop the audio engine: \(error)") }
    log("media: CallKit deactivated audio")
  }

  /// One call's room and the remote audio it hears.
  fileprivate final class Session: NSObject, RoomDelegate, @unchecked Sendable {
    let callID: String
    let sink: any CallxMediaSink
    lazy var room = Room(delegate: self)
    var task: Task<Void, Never>?
    var muted = false
    private weak var owner: LiveKitMediaAdapter?
    private let lock = NSLock()
    private var hearing: Set<String> = []

    init(callID: String, sink: any CallxMediaSink, owner: LiveKitMediaAdapter) {
      self.callID = callID; self.sink = sink; self.owner = owner
    }

    func room(_ room: Room, participant: RemoteParticipant, didSubscribeTrack publication: RemoteTrackPublication) {
      guard publication.kind == .audio, let owner, owner.isCurrent(self) else { return }
      lock.lock(); hearing.insert(publication.sid.stringValue); lock.unlock()
      owner.log("media connected (LiveKit) for \(callID): hearing \(participant.identity?.stringValue ?? "?")")
      sink.connected()
    }

    func room(_ room: Room, participant: RemoteParticipant, didUnsubscribeTrack publication: RemoteTrackPublication) {
      guard publication.kind == .audio, let owner, owner.isCurrent(self) else { return }
      lock.lock(); hearing.remove(publication.sid.stringValue); let silent = hearing.isEmpty; lock.unlock()
      if silent {
        owner.log("media interrupted for \(callID): \(participant.identity?.stringValue ?? "?") is no longer heard")
        sink.interrupted()
      }
    }

    func roomIsReconnecting(_ room: Room) {
      guard let owner, owner.isCurrent(self) else { return }
      owner.log("media interrupted for \(callID): LiveKit is reconnecting"); sink.interrupted()
    }

    func roomDidReconnect(_ room: Room) {
      lock.lock(); let heard = !hearing.isEmpty; lock.unlock()
      guard heard, let owner, owner.isCurrent(self) else { return }
      owner.log("media connected (LiveKit) for \(callID): reconnected"); sink.connected()
    }

    func room(_ room: Room, participantDidDisconnect participant: RemoteParticipant) {
      owner?.log("media: \(participant.identity?.stringValue ?? "?") left the room of \(callID)")
    }

    func room(_ room: Room, didDisconnectWithError error: LiveKitError?) {
      // stop() also disconnects; only a drop while the call is live counts.
      guard let owner, owner.isCurrent(self) else { return }
      owner.log("media: left the room of \(callID) (\(error.map { "\($0)" } ?? "no error"))")
      sink.interrupted()
    }
  }
}
#endif
