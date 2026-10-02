library;

import 'src/native_backend.dart';

export 'src/picture_in_picture.dart';
export 'src/video_view.dart';

/// Contract v0 candidate; 0.2 adds video (ADR-0010).
const contractVersion = '0.2.0';

enum CallState { incoming, outgoing, connecting, active, held, ended }

enum CallDirection { incoming, outgoing }

enum EndReason {
  localHangup,
  declined,
  remoteEnded,
  callerCancelled,
  unanswered,
  busy,
  failed,
  answeredElsewhere,
  declinedElsewhere,
}

enum CommandStatus { applied, rejected, timedOut, unknown }

enum OperationLookupStatus { available, unavailable, generationMismatch }

enum SessionOpenStatus { fresh, resumed, resynced }

enum CallEventKind { callChanged, operationCompleted, resyncRequired }

enum CallEventSource { local, platform, signaling, media, recovery }

enum CallxErrorCode {
  invalidArgument,
  notConfigured,
  callNotFound,
  busy,
  invalidState,
  unsupported,
  permissionDenied,
  platformRejected,
  mediaNotReady,
  deadlineExceeded,
  conflict,
  journalGap,
  nativeUnavailable,
  internal,
}

enum ExecutionMode { native, preview }

/// The local camera. [blocked] means it was on and the OS took it, for example in the background.
enum LocalVideo { off, on, blocked }

enum CameraFacing { front, back }

final class CallInput {
  const CallInput({
    required this.callId,
    required this.displayName,
    required this.handle,
    this.video = false,
  });
  final String callId;
  final String displayName;
  final String handle;

  /// Report the call to CallKit and Telecom as a video call.
  final bool video;
}

/// The device's push token for Callx invitations: `voip` (APNs PushKit) on iOS, `fcm` on
/// Android. Null until the platform issued one.
final class PushToken {
  const PushToken({required this.type, required this.token});
  final String type;
  final String token;
}

final class CallxConfig {
  const CallxConfig({
    @Deprecated('Ignored. The system call screen shows the app display name.')
    this.appName,
  });

  /// Ignored; kept so `CallxConfig(appName: ...)` keeps compiling. The system call screen shows
  /// the app's display name on both platforms.
  @Deprecated('Ignored. The system call screen shows the app display name.')
  final String? appName;
}

final class Call {
  const Call({
    required this.callId,
    required this.displayName,
    required this.direction,
    required this.state,
    this.muted = false,
    this.mediaReady = false,
    this.mediaInterrupted = false,
    this.video = false,
    this.localVideo = LocalVideo.off,
    this.cameraFacing,
    this.remoteVideo = false,
    this.endReason,
    this.createdAtMs,
    this.acceptedAtMs,
    this.mediaConnectedAtMs,
    this.endedAtMs,
  });
  final String callId;
  final String displayName;
  final CallDirection direction;
  final CallState state;
  final bool muted;
  final bool mediaReady;

  /// Media connected once and has since dropped, for example while the media SDK
  /// reconnects. The call is still live; show a reconnecting state.
  final bool mediaInterrupted;

  /// Offered or started as a video call.
  final bool video;
  final LocalVideo localVideo;

  /// The camera in use; non-null while [localVideo] is not [LocalVideo.off].
  final CameraFacing? cameraFacing;

  /// A remote video track is available to render.
  final bool remoteVideo;
  final EndReason? endReason;
  final int? createdAtMs;
  final int? acceptedAtMs;
  final int? mediaConnectedAtMs;
  final int? endedAtMs;
  Call copyWith({
    CallState? state,
    bool? muted,
    bool? mediaReady,
    bool? mediaInterrupted,
    bool? video,
    LocalVideo? localVideo,
    CameraFacing? cameraFacing,
    bool? remoteVideo,
    EndReason? endReason,
    int? createdAtMs,
    int? acceptedAtMs,
    int? mediaConnectedAtMs,
    int? endedAtMs,
  }) => Call(
    callId: callId,
    displayName: displayName,
    direction: direction,
    state: state ?? this.state,
    muted: muted ?? this.muted,
    mediaReady: mediaReady ?? this.mediaReady,
    mediaInterrupted: mediaInterrupted ?? this.mediaInterrupted,
    video: video ?? this.video,
    localVideo: localVideo ?? this.localVideo,
    // The camera shows only while it is not off, as on the wire.
    cameraFacing: (localVideo ?? this.localVideo) == LocalVideo.off
        ? null
        : cameraFacing ?? this.cameraFacing,
    remoteVideo: remoteVideo ?? this.remoteVideo,
    endReason: endReason ?? this.endReason,
    createdAtMs: createdAtMs ?? this.createdAtMs,
    acceptedAtMs: acceptedAtMs ?? this.acceptedAtMs,
    mediaConnectedAtMs: mediaConnectedAtMs ?? this.mediaConnectedAtMs,
    endedAtMs: endedAtMs ?? this.endedAtMs,
  );
}

final class CallSnapshot {
  const CallSnapshot({required this.sequence, this.call});
  final String sequence;
  final Call? call;
}

final class CommandResult {
  const CommandResult({
    required this.operationId,
    required this.status,
    required this.execution,
    required this.completedAtMs,
    this.error,
  });
  String get contract => contractVersion;
  final String operationId;
  final CommandStatus status;
  final ExecutionMode execution;
  final int completedAtMs;
  final OperationError? error;
}

final class OperationLookup {
  const OperationLookup({
    required this.operationId,
    required this.accountGeneration,
    required this.status,
    this.result,
  });
  String get contract => contractVersion;
  final String operationId;
  final String accountGeneration;
  final OperationLookupStatus status;
  final CommandResult? result;
}

final class CallEvent {
  const CallEvent({
    required this.eventId,
    required this.sequence,
    required this.kind,
    required this.source,
    required this.observedAtMs,
    this.callId,
    this.operationId,
  });
  String get contract => contractVersion;
  final String eventId;
  final String sequence;
  final CallEventKind kind;
  final CallEventSource source;
  final int observedAtMs;
  final String? callId;
  final String? operationId;
}

final class ObservationSnapshot {
  const ObservationSnapshot({required this.watermark, required this.calls});
  String get contract => contractVersion;
  final String watermark;
  final List<Call> calls;
}

final class ObservationSession {
  const ObservationSession({
    required this.sessionId,
    required this.accountGeneration,
    required this.status,
    required this.snapshot,
    required this.replay,
  });
  String get contract => contractVersion;
  final String sessionId;
  final String accountGeneration;
  final SessionOpenStatus status;
  final ObservationSnapshot snapshot;
  final List<CallEvent> replay;
}

final class CallxCapabilities {
  const CallxCapabilities({
    required this.coreVersion,
    required this.execution,
    required this.accountGeneration,
    required this.nativeCalling,
    required this.durableReplay,
    required this.providerManagedSignaling,
    required this.hold,
    required this.mute,
    this.video = false,
  });
  String get contract => contractVersion;
  final String coreVersion;
  final ExecutionMode execution;
  final String accountGeneration;
  final bool nativeCalling;
  final bool durableReplay;
  final bool providerManagedSignaling;
  final bool hold;
  final bool mute;

  /// A video media adapter is installed; [Callx.setCamera] and [Callx.switchCamera] work.
  final bool video;
}

final class PlatformError {
  const PlatformError({required this.domain, required this.code});
  final String domain;
  final String code;
}

final class OperationError {
  const OperationError({
    required this.code,
    required this.message,
    required this.retryable,
    this.platform,
  });
  final CallxErrorCode code;
  final String message;
  final bool retryable;
  final PlatformError? platform;
}

final class CommandOptions {
  const CommandOptions({this.operationId, this.deadlineAtMs});
  final String? operationId;
  final int? deadlineAtMs;
}

final class CallxException implements Exception {
  const CallxException(this.code, this.message);
  final String code;
  final String message;
  @override
  String toString() => '$code: $message';
}

enum CommandType {
  startCall,
  answer,
  end,
  setMuted,
  setHeld,
  setCamera,
  switchCamera,
}

final class CallCommand {
  const CallCommand(
    this.type, {
    required this.operationId,
    this.deadlineAtMs,
    this.callId,
    this.input,
    this.value,
    this.facing,
  });
  String get contract => contractVersion;
  final CommandType type;
  final String operationId;
  final int? deadlineAtMs;
  final String? callId;
  final CallInput? input;
  final bool? value;

  /// [CommandType.switchCamera] only.
  final CameraFacing? facing;
}

/// The default backend delegates to the configured native runtime.
abstract interface class CallxBackend {
  Future<CallxCapabilities> setup([CallxConfig config = const CallxConfig()]);
  Future<CommandResult> execute(CallCommand command);
  Future<OperationLookup> queryOperation(
    String operationId,
    String accountGeneration,
  );
  Future<ObservationSession> openSession([String? afterSequence]);
  Stream<CallEvent> eventsFor(String sessionId);
  Future<void> acknowledge(String sessionId, String throughSequence);
  Future<void> closeSession(String sessionId);
  Future<CallSnapshot> getSnapshot();
  Future<PushToken?> pushToken();
  Stream<CallSnapshot> get snapshots;
  Future<void> dispose();
}

final class Callx {
  Callx({CallxBackend? backend}) : _transport = backend ?? NativeCallxBackend();
  final CallxBackend _transport;
  int _operationCounter = 0;
  CallxBackend get _backend => _transport;
  Future<CallxCapabilities> setup([
    CallxConfig config = const CallxConfig(),
  ]) async => _backend.setup(config);
  ({String operationId, int? deadlineAtMs}) _operation(
    CommandOptions? options,
  ) {
    final operationId =
        options?.operationId ??
        'callx-op-${DateTime.now().millisecondsSinceEpoch}-${++_operationCounter}';
    if (operationId.trim().isEmpty) {
      throw const CallxException('invalidArgument', 'operationId is required.');
    }
    return (operationId: operationId, deadlineAtMs: options?.deadlineAtMs);
  }

  Future<CommandResult> startCall(
    CallInput input, {
    CommandOptions? options,
  }) async {
    final operation = _operation(options);
    return _backend.execute(
      CallCommand(
        CommandType.startCall,
        operationId: operation.operationId,
        deadlineAtMs: operation.deadlineAtMs,
        input: input,
      ),
    );
  }

  Future<CommandResult> answer(
    String callId, {
    CommandOptions? options,
  }) async => _executeForCall(CommandType.answer, callId, options: options);

  Future<CommandResult> end(String callId, {CommandOptions? options}) async =>
      _executeForCall(CommandType.end, callId, options: options);

  Future<CommandResult> setMuted(
    String callId,
    bool value, {
    CommandOptions? options,
  }) async => _executeForCall(
    CommandType.setMuted,
    callId,
    value: value,
    options: options,
  );

  Future<CommandResult> setHeld(
    String callId,
    bool value, {
    CommandOptions? options,
  }) async => _executeForCall(
    CommandType.setHeld,
    callId,
    value: value,
    options: options,
  );

  /// Turns the local camera on or off. Applied once the media adapter publishes or stops the
  /// camera; rejected with `permissionDenied` without the camera permission, `mediaNotReady`
  /// while the app is in the background, and `unsupported` without a video adapter.
  Future<CommandResult> setCamera(
    String callId,
    bool on, {
    CommandOptions? options,
  }) async => _executeForCall(
    CommandType.setCamera,
    callId,
    value: on,
    options: options,
  );

  /// Chooses the front or back camera; remembered while the camera is off.
  Future<CommandResult> switchCamera(
    String callId,
    CameraFacing facing, {
    CommandOptions? options,
  }) async => _executeForCall(
    CommandType.switchCamera,
    callId,
    facing: facing,
    options: options,
  );

  Future<CommandResult> _executeForCall(
    CommandType type,
    String callId, {
    bool? value,
    CameraFacing? facing,
    CommandOptions? options,
  }) async {
    final operation = _operation(options);
    return _backend.execute(
      CallCommand(
        type,
        operationId: operation.operationId,
        deadlineAtMs: operation.deadlineAtMs,
        callId: callId,
        value: value,
        facing: facing,
      ),
    );
  }

  Future<CallSnapshot> getSnapshot() async => _backend.getSnapshot();

  /// The push token to register with your backend after sign-in and on each launch.
  Future<PushToken?> pushToken() => _backend.pushToken();

  Future<OperationLookup> queryOperation(
    String operationId,
    String accountGeneration,
  ) async => _backend.queryOperation(operationId, accountGeneration);

  Future<ObservationSession> openSession([String? afterSequence]) async =>
      _backend.openSession(afterSequence);
  Stream<CallEvent> eventsFor(String sessionId) =>
      _backend.eventsFor(sessionId);
  Future<void> acknowledge(String sessionId, String throughSequence) async =>
      _backend.acknowledge(sessionId, throughSequence);
  Future<void> closeSession(String sessionId) async =>
      _backend.closeSession(sessionId);

  /// Each listener gets the current snapshot, followed by changes.
  Stream<CallSnapshot> get snapshots => _backend.snapshots;
  Future<void> dispose() async => _transport.dispose();
}
