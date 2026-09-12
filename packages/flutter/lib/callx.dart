/// Public API preview. Native bridge deliberately not implemented.
library;

enum CallState { incoming, outgoing, connecting, active, held, ended }

enum CallDirection { incoming, outgoing }

enum EndReason { localHangup, declined, remoteEnded }

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
  });
  final String callId;
  final String displayName;
  final CallDirection direction;
  final CallState state;
  final bool muted;
  final bool mediaReady;
  final EndReason? endReason;
  Call copyWith({
    CallState? state,
    bool? muted,
    bool? mediaReady,
    EndReason? endReason,
  }) => Call(
    callId: callId,
    displayName: displayName,
    direction: direction,
    state: state ?? this.state,
    muted: muted ?? this.muted,
    mediaReady: mediaReady ?? this.mediaReady,
    endReason: endReason ?? this.endReason,
  );
}

final class CallSnapshot {
  const CallSnapshot({required this.sequence, this.call});
  final String sequence;
  final Call? call;
}

final class CommandResult {
  const CommandResult(this.operationId);
  final String operationId;
  String get status => 'applied';
  String get execution => 'preview';
}

final class CallxCapabilities {
  const CallxCapabilities();
  String get execution => 'preview';
  bool get nativeCalling => false;
  bool get durableReplay => false;
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
  const CallCommand(this.type, {this.callId, this.input, this.value});
  final CommandType type;
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
  CallxBackend get _backend =>
      _transport ??
      (throw const CallxException(
        'nativeNotImplemented',
        'Native calling is not implemented. Import callx_preview.dart explicitly.',
      ));
  Future<CallxCapabilities> setup(CallxConfig config) async =>
      _backend.setup(config);
  Future<CommandResult> startCall(CallInput input) async =>
      _backend.execute(CallCommand(CommandType.startCall, input: input));
  Future<CommandResult> answer(String callId) async =>
      _backend.execute(CallCommand(CommandType.answer, callId: callId));
  Future<CommandResult> end(String callId) async =>
      _backend.execute(CallCommand(CommandType.end, callId: callId));
  Future<CommandResult> setMuted(String callId, bool value) async => _backend
      .execute(CallCommand(CommandType.setMuted, callId: callId, value: value));
  Future<CommandResult> setHeld(String callId, bool value) async => _backend
      .execute(CallCommand(CommandType.setHeld, callId: callId, value: value));
  Future<CallSnapshot> getSnapshot() async => _backend.getSnapshot();

  /// Each listener gets the current snapshot, followed by changes.
  Stream<CallSnapshot> get snapshots => _backend.snapshots;
  Future<void> dispose() async => _transport?.dispose();
}
