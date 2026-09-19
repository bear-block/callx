import 'dart:async';

import 'package:flutter/services.dart';

import '../callx.dart';

final class NativeCallxBackend implements CallxBackend {
  NativeCallxBackend({MethodChannel? methods, EventChannel? events})
    : _methods = methods ?? const MethodChannel('dev.callx/methods'),
      _events = events ?? const EventChannel('dev.callx/events');

  final MethodChannel _methods;
  final EventChannel _events;
  Stream<Map<Object?, Object?>>? _nativeEvents;

  Future<Map<Object?, Object?>> _invoke(
    String method, [
    Object? arguments,
  ]) async {
    try {
      final value = await _methods.invokeMethod<Object?>(method, arguments);
      if (value is! Map) {
        throw const CallxException(
          'internal',
          'Native response must be a map.',
        );
      }
      return value.cast<Object?, Object?>();
    } on PlatformException catch (error) {
      throw CallxException(
        error.code,
        error.message ?? 'Native Callx operation failed.',
      );
    } on MissingPluginException {
      throw const CallxException(
        'nativeUnavailable',
        'Callx native plugin is not registered.',
      );
    }
  }

  @override
  Future<CallxCapabilities> setup(CallxConfig config) async => _capabilities(
    await _invoke('setup', {
      'contractVersion': contractVersion,
      'appName': config.appName,
    }),
  );

  @override
  Future<CommandResult> execute(CallCommand command) async =>
      _result(await _invoke('execute', _command(command)));

  @override
  Future<OperationLookup> queryOperation(
    String operationId,
    String accountGeneration,
  ) async {
    final map = await _invoke('queryOperation', {
      'contractVersion': contractVersion,
      'operationId': operationId,
      'accountGeneration': accountGeneration,
    });
    return OperationLookup(
      operationId: _string(map, 'operationId'),
      accountGeneration: _string(map, 'accountGeneration'),
      status: _enum(OperationLookupStatus.values, _string(map, 'status')),
      result: map['result'] is Map
          ? _result((map['result'] as Map).cast<Object?, Object?>())
          : null,
    );
  }

  @override
  Future<ObservationSession> openSession([String? afterSequence]) async {
    final map = await _invoke('openSession', {
      'contractVersion': contractVersion,
      'afterSequence': ?afterSequence,
    });
    final snapshot = (map['snapshot'] as Map).cast<Object?, Object?>();
    return ObservationSession(
      sessionId: _string(map, 'sessionId'),
      accountGeneration: _string(map, 'accountGeneration'),
      status: _enum(SessionOpenStatus.values, _string(map, 'status')),
      snapshot: ObservationSnapshot(
        watermark: _string(snapshot, 'watermark'),
        calls: ((snapshot['calls'] as List?) ?? const [])
            .map((e) => _call((e as Map).cast<Object?, Object?>()))
            .toList(),
      ),
      replay: ((map['replay'] as List?) ?? const [])
          .map((e) => _event((e as Map).cast<Object?, Object?>()))
          .toList(),
    );
  }

  @override
  Stream<CallEvent> eventsFor(String sessionId) =>
      (_nativeEvents ??= _events.receiveBroadcastStream().map(
        (e) => (e as Map).cast<Object?, Object?>(),
      )).where((event) => event['sessionId'] == sessionId).map(_event);

  @override
  Future<void> acknowledge(String sessionId, String throughSequence) async {
    await _invoke('acknowledge', {
      'sessionId': sessionId,
      'throughSequence': throughSequence,
    });
  }

  @override
  Future<void> closeSession(String sessionId) async {
    await _invoke('closeSession', {'sessionId': sessionId});
  }

  @override
  Future<CallSnapshot> getSnapshot() async {
    final map = await _invoke('getSnapshot');
    return CallSnapshot(
      sequence: _string(map, 'sequence'),
      call: map['call'] is Map
          ? _call((map['call'] as Map).cast<Object?, Object?>())
          : null,
    );
  }

  @override
  Stream<CallSnapshot> get snapshots async* {
    final session = await openSession();
    yield CallSnapshot(
      sequence: session.snapshot.watermark,
      call: session.snapshot.calls.isEmpty
          ? null
          : session.snapshot.calls.single,
    );
    await for (final _ in eventsFor(session.sessionId)) {
      yield await getSnapshot();
    }
  }

  @override
  Future<void> dispose() async {
    await _methods.invokeMethod<void>('dispose');
  }

  Map<String, Object?> _command(CallCommand value) => {
    'contractVersion': contractVersion,
    'operationId': value.operationId,
    'type': value.type.name,
    if (value.deadlineAtMs != null) 'deadlineAtMs': value.deadlineAtMs,
    if (value.callId != null) 'callId': value.callId,
    if (value.value != null) 'value': value.value,
    if (value.input != null)
      'input': {
        'callId': value.input!.callId,
        'displayName': value.input!.displayName,
        'handle': value.input!.handle,
      },
  };

  CallxCapabilities _capabilities(Map<Object?, Object?> map) =>
      CallxCapabilities(
        coreVersion: _string(map, 'coreVersion'),
        execution: _enum(ExecutionMode.values, _string(map, 'execution')),
        accountGeneration: _string(map, 'accountGeneration'),
        nativeCalling: map['nativeCalling'] == true,
        durableReplay: map['durableReplay'] == true,
        providerManagedSignaling: map['providerManagedSignaling'] == true,
        hold: map['hold'] == true,
        mute: map['mute'] == true,
      );

  CommandResult _result(Map<Object?, Object?> map) => CommandResult(
    operationId: _string(map, 'operationId'),
    status: _enum(CommandStatus.values, _string(map, 'status')),
    execution: _enum(ExecutionMode.values, _string(map, 'execution')),
    completedAtMs: _integer(map, 'completedAtMs'),
    error: map['error'] is Map
        ? _error((map['error'] as Map).cast<Object?, Object?>())
        : null,
  );

  OperationError _error(Map<Object?, Object?> map) => OperationError(
    code: _enum(CallxErrorCode.values, _string(map, 'code')),
    message: _string(map, 'message'),
    retryable: map['retryable'] == true,
    platform: map['platform'] is Map
        ? PlatformError(
            domain: _string(
              (map['platform'] as Map).cast<Object?, Object?>(),
              'domain',
            ),
            code: _string(
              (map['platform'] as Map).cast<Object?, Object?>(),
              'code',
            ),
          )
        : null,
  );

  Call _call(Map<Object?, Object?> map) => Call(
    callId: _string(map, 'callId'),
    displayName: _string(map, 'displayName'),
    direction: _enum(CallDirection.values, _string(map, 'direction')),
    state: _enum(CallState.values, _string(map, 'state')),
    muted: map['muted'] == true,
    mediaReady: map['mediaReady'] == true,
    endReason: map['endReason'] == null
        ? null
        : _enum(EndReason.values, _string(map, 'endReason')),
    createdAtMs: map['createdAtMs'] as int?,
    acceptedAtMs: map['acceptedAtMs'] as int?,
    mediaConnectedAtMs: map['mediaConnectedAtMs'] as int?,
    endedAtMs: map['endedAtMs'] as int?,
  );

  CallEvent _event(Map<Object?, Object?> map) => CallEvent(
    eventId: _string(map, 'eventId'),
    sequence: _string(map, 'sequence'),
    kind: _enum(CallEventKind.values, _string(map, 'kind')),
    source: _enum(CallEventSource.values, _string(map, 'source')),
    observedAtMs: _integer(map, 'observedAtMs'),
    callId: map['callId'] as String?,
    operationId: map['operationId'] as String?,
  );

  String _string(Map<Object?, Object?> map, String key) => map[key] is String
      ? map[key]! as String
      : throw CallxException('internal', 'Native field $key is invalid.');
  int _integer(Map<Object?, Object?> map, String key) => map[key] is int
      ? map[key]! as int
      : throw CallxException('internal', 'Native field $key is invalid.');
  T _enum<T extends Enum>(List<T> values, String name) => values.firstWhere(
    (value) => value.name == name,
    orElse: () => throw CallxException('internal', 'Unknown enum $name.'),
  );
}
