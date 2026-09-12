/// Contract v0 candidate. Native bridge deliberately not implemented.
library;

const contractVersion = '0.1.0';

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

final class CallInput {
  const CallInput({required this.callId, required this.displayName});
  final String callId;
  final String displayName;
}

final class CallxConfig {
  const CallxConfig({required this.appName});
  final String appName;
}

final class Call {
  const Call({
    required this.callId,
    required this.displayName,
    required this.direction,
    required this.state,
    this.muted = false,
    this.mediaReady = false,
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
  final EndReason? endReason;
  final int? createdAtMs;
  final int? acceptedAtMs;
  final int? mediaConnectedAtMs;
  final int? endedAtMs;
  Call copyWith({
    CallState? state,
    bool? muted,
    bool? mediaReady,
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

final class CallxCapabilities {
  const CallxCapabilities({
    required this.coreVersion,
    required this.execution,
    required this.nativeCalling,
    required this.durableReplay,
    required this.providerManagedSignaling,
    required this.hold,
    required this.mute,
  });
  String get contract => contractVersion;
  final String coreVersion;
  final ExecutionMode execution;
  final bool nativeCalling;
  final bool durableReplay;
  final bool providerManagedSignaling;
  final bool hold;
  final bool mute;
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

enum CommandType { startCall, answer, end, setMuted, setHeld }

final class CallCommand {
  const CallCommand(
    this.type, {
    required this.operationId,
    this.deadlineAtMs,
    this.callId,
    this.input,
    this.value,
  });
  String get contract => contractVersion;
  final CommandType type;
  final String operationId;
  final int? deadlineAtMs;
  final String? callId;
  final CallInput? input;
  final bool? value;
}

/// Production implementation will delegate to native, not the preview simulator.
abstract interface class CallxBackend {
  Future<CallxCapabilities> setup(CallxConfig config);
  Future<CommandResult> execute(CallCommand command);
  Future<CallSnapshot> getSnapshot();
  Stream<CallSnapshot> get snapshots;
  Future<void> dispose();
}

final class Callx {
  Callx({CallxBackend? backend}) : _transport = backend;
  final CallxBackend? _transport;
  int _operationCounter = 0;
  CallxBackend get _backend =>
      _transport ??
      (throw const CallxException(
        'nativeNotImplemented',
        'Native calling is not implemented. Import callx_preview.dart explicitly.',
      ));
  Future<CallxCapabilities> setup(CallxConfig config) async =>
      _backend.setup(config);
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

  Future<CommandResult> _executeForCall(
    CommandType type,
    String callId, {
    bool? value,
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
      ),
    );
  }

  Future<CallSnapshot> getSnapshot() async => _backend.getSnapshot();

  /// Each listener gets the current snapshot, followed by changes.
  Stream<CallSnapshot> get snapshots => _backend.snapshots;
  Future<void> dispose() async => _transport?.dispose();
}
