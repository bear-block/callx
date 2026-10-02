#if os(iOS)
import AVFAudio
import AVFoundation
import Foundation
import LiveKit
import UIKit
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
/// earlier; audio starts when CallKit activates the session. It implements `CallxVideoAdapter`
/// (ADR-0009, ADR-0010): the ingress starts and stops it, it reports readiness, interruptions and
/// video through the call's sink, never a call end, and it renders video with LiveKit's
/// `VideoView` in the surfaces `CallxVideoView` attaches.
public final class LiveKitMediaAdapter: NSObject, CallxVideoAdapter, @unchecked Sendable {
  private let credentials: @Sendable (String) async throws -> LiveKitCredentials
  private let log: @Sendable (String) -> Void
  private let lock = NSLock()
  private var sessions: [String: Session] = [:]
  /// Surfaces `CallxVideoView` attached, with the LiveKit view added to each. Main actor only.
  @MainActor private var bindings: [ObjectIdentifier: Binding] = [:]
  private var observers: [NSObjectProtocol] = []

  public init(credentials: @escaping @Sendable (String) async throws -> LiveKitCredentials,
       log: @escaping @Sendable (String) -> Void) {
    self.credentials = credentials; self.log = log
    super.init()
    // Before any room exists: CallKit, not LiveKit, activates the audio session.
    AudioManager.shared.audioSession.isAutomaticConfigurationEnabled = false
    do { try AudioManager.shared.setEngineAvailability(.none) }
    catch { log("media: could not hold the audio engine for CallKit: \(error)") }
    // iOS interrupts the camera in the background and LiveKit resumes it in front; report both.
    let center = NotificationCenter.default
    observers = [
      center.addObserver(forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: nil) { [weak self] _ in
        self?.cameraAvailability(.blocked)
      },
      center.addObserver(forName: UIApplication.willEnterForegroundNotification, object: nil, queue: nil) { [weak self] _ in
        self?.cameraAvailability(.on)
      },
    ]
  }

  deinit { observers.forEach(NotificationCenter.default.removeObserver) }

  private func cameraAvailability(_ state: LocalVideo) {
    for session in lock.withLock({ Array(sessions.values) }) where session.localVideo != nil {
      log("media: camera \(state == .blocked ? "paused in the background" : "resumed") for \(session.callID)")
      session.sink.videoChanged(localVideo: state, remoteVideo: nil)
    }
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
    session.localVideo = nil; session.remoteVideo = nil
    Task { @MainActor in self.refresh(callID) }
    Task { await session.room.disconnect() }
  }

  /// Publishes, switches or stops the camera. The core already checked that the app is in front.
  public func setCamera(callID: String, on: Bool, facing: CameraFacing) async -> CallxCameraError? {
    guard let session = lock.withLock({ sessions[callID] }), session.room.connectionState == .connected else {
      return .mediaNotReady
    }
    let position: AVCaptureDevice.Position = facing == .back ? .back : .front
    if on, AVCaptureDevice.authorizationStatus(for: .video) != .authorized {
      log("media: no camera permission for \(callID)"); return .permissionDenied
    }
    do {
      if on, let track = session.localVideo {
        _ = try await (track.capturer as? CameraCapturer)?.set(cameraPosition: position)
      } else if on {
        let publication = try await session.room.localParticipant.setCamera(enabled: true,
          captureOptions: CameraCaptureOptions(position: position))
        guard let track = publication?.track as? LocalVideoTrack else { return .platformRejected }
        session.localVideo = track
      } else {
        try await session.room.localParticipant.setCamera(enabled: false)
        session.localVideo = nil
      }
      log("media: camera \(on ? "on (\(facing.rawValue))" : "off") for \(callID)")
      await refresh(callID)
      return nil
    } catch {
      log("media: camera failed for \(callID): \(error)"); return .platformRejected
    }
  }

  @MainActor public func attach(callID: String, source: VideoSource, surface: CallxVideoSurface) {
    detach(callID: callID, surface: surface)
    bindings[ObjectIdentifier(surface)] = Binding(callID: callID, source: source, surface: surface)
    refresh(callID)
  }

  @MainActor public func detach(callID: String, surface: CallxVideoSurface) {
    guard let binding = bindings.removeValue(forKey: ObjectIdentifier(surface)) else { return }
    binding.view?.track = nil
    binding.view?.removeFromSuperview()
  }

  /// Puts each surface of `callID` in step with the track it should show.
  @MainActor fileprivate func refresh(_ callID: String) {
    let session = lock.withLock { sessions[callID] }
    for binding in bindings.values where binding.callID == callID {
      let track: VideoTrack? = binding.source == .local ? session?.localVideo : session?.visibleRemoteVideo
      guard let track else { binding.view?.track = nil; continue }
      let view = binding.view ?? {
        let view = VideoView(frame: binding.surface.container.bounds)
        view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.layoutMode = binding.surface.fit == .contain ? .fit : .fill
        view.mirrorMode = binding.surface.mirror ? .mirror : .off
        binding.surface.container.addSubview(view)
        binding.view = view
        return view
      }()
      // VideoView holds its track weakly; the session keeps it.
      if view.track !== track { view.track = track }
    }
  }

  /// A surface and the LiveKit view added to it.
  @MainActor private final class Binding {
    let callID: String
    let source: VideoSource
    let surface: CallxVideoSurface
    var view: VideoView?
    init(callID: String, source: VideoSource, surface: CallxVideoSurface) {
      self.callID = callID; self.source = source; self.surface = surface
    }
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
    private var _remoteVideo: VideoTrack?
    private var _remoteVideoMuted = false
    private var _localVideo: LocalVideoTrack?
    /// The remote video shown in remote surfaces: the first subscribed video track.
    var remoteVideo: VideoTrack? {
      get { lock.withLock { _remoteVideo } }
      set { lock.withLock { _remoteVideo = newValue } }
    }
    var remoteVideoMuted: Bool {
      get { lock.withLock { _remoteVideoMuted } }
      set { lock.withLock { _remoteVideoMuted = newValue } }
    }
    var visibleRemoteVideo: VideoTrack? {
      lock.withLock { _remoteVideoMuted ? nil : _remoteVideo }
    }
    /// The local camera while it is published.
    var localVideo: LocalVideoTrack? {
      get { lock.withLock { _localVideo } }
      set { lock.withLock { _localVideo = newValue } }
    }

    init(callID: String, sink: any CallxMediaSink, owner: LiveKitMediaAdapter) {
      self.callID = callID; self.sink = sink; self.owner = owner
    }

    func room(_ room: Room, participant: RemoteParticipant, didSubscribeTrack publication: RemoteTrackPublication) {
      guard let owner, owner.isCurrent(self) else { return }
      if publication.kind == .video, remoteVideo == nil, let track = publication.track as? VideoTrack {
        remoteVideo = track
        remoteVideoMuted = publication.isMuted
        owner.log("media: remote video for \(callID) from \(participant.identity?.stringValue ?? "?")")
        sink.videoChanged(localVideo: nil, remoteVideo: !publication.isMuted)
        Task { @MainActor [callID] in owner.refresh(callID) }
        return
      }
      guard publication.kind == .audio else { return }
      lock.lock(); hearing.insert(publication.sid.stringValue); lock.unlock()
      owner.log("media connected (LiveKit) for \(callID): hearing \(participant.identity?.stringValue ?? "?")")
      sink.connected()
    }

    func room(_ room: Room, participant: RemoteParticipant, didUnsubscribeTrack publication: RemoteTrackPublication) {
      guard let owner, owner.isCurrent(self) else { return }
      if publication.kind == .video, let track = remoteVideo, publication.track === track || publication.track == nil {
        remoteVideo = nil
        remoteVideoMuted = false
        owner.log("media: remote video for \(callID) stopped")
        sink.videoChanged(localVideo: nil, remoteVideo: false)
        Task { @MainActor [callID] in owner.refresh(callID) }
        return
      }
      guard publication.kind == .audio else { return }
      lock.lock(); hearing.remove(publication.sid.stringValue); let silent = hearing.isEmpty; lock.unlock()
      if silent {
        owner.log("media interrupted for \(callID): \(participant.identity?.stringValue ?? "?") is no longer heard")
        sink.interrupted()
      }
    }

    func room(_ room: Room, participant: Participant, trackPublication publication: TrackPublication, didUpdateIsMuted isMuted: Bool) {
      guard let owner, owner.isCurrent(self), participant is RemoteParticipant,
        let selected = remoteVideo, publication.track === selected else { return }
      remoteVideoMuted = isMuted
      owner.log("media: remote video for \(callID) \(isMuted ? "paused" : "resumed")")
      sink.videoChanged(localVideo: nil, remoteVideo: !isMuted)
      Task { @MainActor [callID] in owner.refresh(callID) }
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
