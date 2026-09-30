import AVFAudio
import Foundation
import LiveKit
// The same file serves both examples; the Callx Swift module is named per framework.
#if canImport(callx)
import callx
#elseif canImport(callx_react_native)
import callx_react_native
#endif

/// Where and as whom a call's media connects. A real app gets this from its backend.
struct MediaCredentials: Sendable {
  let url: String
  let token: String
}

/// Example media adapter: one LiveKit room per call, joined when the call is answered and left
/// when it ends. It follows ADR-0004 and Apple's CallKit rules: CallKit owns the audio session,
/// so LiveKit's automatic session configuration is off and its audio engine may run only between
/// `didActivate` and `didDeactivate`. Joining the room and publishing the microphone can happen
/// earlier; audio starts when CallKit activates the session. Media never decides the call's
/// state: it reports readiness and interruptions, never a call end.
final class LiveKitCallMedia: NSObject, CallKitAudioSessionHandling, @unchecked Sendable {
  private let credentials: @Sendable (String) async throws -> MediaCredentials
  private let onConnected: @Sendable (String) -> Void
  private let onInterrupted: @Sendable (String) -> Void
  private let log: @Sendable (String) -> Void
  private let lock = NSLock()
  private var sessions: [String: Session] = [:]

  init(credentials: @escaping @Sendable (String) async throws -> MediaCredentials,
       onConnected: @escaping @Sendable (String) -> Void,
       onInterrupted: @escaping @Sendable (String) -> Void,
       log: @escaping @Sendable (String) -> Void) {
    self.credentials = credentials; self.onConnected = onConnected
    self.onInterrupted = onInterrupted; self.log = log
    super.init()
    // Before any room exists: CallKit, not LiveKit, activates the audio session.
    AudioManager.shared.audioSession.isAutomaticConfigurationEnabled = false
    do { try AudioManager.shared.setEngineAvailability(.none) }
    catch { log("media: could not hold the audio engine for CallKit: \(error)") }
  }

  /// Joins the call's room. Returns at once; idempotent per call.
  func start(callID: String) {
    lock.lock()
    guard sessions[callID] == nil else { lock.unlock(); return }
    let session = Session(callID: callID, owner: self)
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
  func stop(callID: String) {
    lock.lock(); let session = sessions.removeValue(forKey: callID); lock.unlock()
    guard let session else { return }
    session.task?.cancel()
    Task { await session.room.disconnect() }
  }

  /// Mute from the app or from CallKit. Before joining, applies on join.
  func setMuted(callID: String, muted: Bool) async -> Bool {
    lock.lock(); let session = sessions[callID]; lock.unlock()
    guard let session else { return false }
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

  static var microphoneAllowed: Bool {
    if #available(iOS 17.0, *) { return AVAudioApplication.shared.recordPermission == .granted }
    return AVAudioSession.sharedInstance().recordPermission == .granted
  }

  /// Ask while the app is in use: a call answered on the lock screen cannot show the prompt.
  static func requestMicrophone() async -> Bool {
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
  func didActivate(_ audioSession: AVAudioSession) {
    do {
      try audioSession.setCategory(.playAndRecord, mode: .voiceChat)
      try AudioManager.shared.setEngineAvailability(.default)
      log("media: CallKit activated audio")
    } catch { log("media: could not start audio after CallKit activation: \(error)") }
  }

  func didDeactivate(_ audioSession: AVAudioSession) {
    do { try AudioManager.shared.setEngineAvailability(.none) }
    catch { log("media: could not stop the audio engine: \(error)") }
    log("media: CallKit deactivated audio")
  }

  /// One call's room and the remote audio it hears.
  fileprivate final class Session: NSObject, RoomDelegate, @unchecked Sendable {
    let callID: String
    lazy var room = Room(delegate: self)
    var task: Task<Void, Never>?
    var muted = false
    private weak var owner: LiveKitCallMedia?
    private let lock = NSLock()
    private var hearing: Set<String> = []

    init(callID: String, owner: LiveKitCallMedia) { self.callID = callID; self.owner = owner }

    func room(_ room: Room, participant: RemoteParticipant, didSubscribeTrack publication: RemoteTrackPublication) {
      guard publication.kind == .audio, let owner, owner.isCurrent(self) else { return }
      lock.lock(); hearing.insert(publication.sid.stringValue); lock.unlock()
      owner.log("media connected (LiveKit) for \(callID): hearing \(participant.identity?.stringValue ?? "?")")
      owner.onConnected(callID)
    }

    func room(_ room: Room, participant: RemoteParticipant, didUnsubscribeTrack publication: RemoteTrackPublication) {
      guard publication.kind == .audio, let owner, owner.isCurrent(self) else { return }
      lock.lock(); hearing.remove(publication.sid.stringValue); let silent = hearing.isEmpty; lock.unlock()
      if silent {
        owner.log("media interrupted for \(callID): \(participant.identity?.stringValue ?? "?") is no longer heard")
        owner.onInterrupted(callID)
      }
    }

    func roomIsReconnecting(_ room: Room) {
      guard let owner, owner.isCurrent(self) else { return }
      owner.log("media interrupted for \(callID): LiveKit is reconnecting"); owner.onInterrupted(callID)
    }

    func roomDidReconnect(_ room: Room) {
      lock.lock(); let heard = !hearing.isEmpty; lock.unlock()
      guard heard, let owner, owner.isCurrent(self) else { return }
      owner.log("media connected (LiveKit) for \(callID): reconnected"); owner.onConnected(callID)
    }

    func room(_ room: Room, participantDidDisconnect participant: RemoteParticipant) {
      owner?.log("media: \(participant.identity?.stringValue ?? "?") left the room of \(callID)")
    }

    func room(_ room: Room, didDisconnectWithError error: LiveKitError?) {
      // stop() also disconnects; only a drop while the call is live counts.
      guard let owner, owner.isCurrent(self) else { return }
      owner.log("media: left the room of \(callID) (\(error.map { "\($0)" } ?? "no error"))")
      owner.onInterrupted(callID)
    }
  }
}
