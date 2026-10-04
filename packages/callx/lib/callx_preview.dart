/// Memory-only UX simulator: no OS UI, audio, push, network or durable replay.
library;

import 'dart:async';
import 'callx.dart';

abstract interface class CallxSimulator {
  Future<void> incoming(CallInput input);
  Future<void> remoteAnswered();
  Future<void> mediaConnected();
  Future<void> remoteEnded();

  /// Simulates the remote side publishing or stopping video.
  Future<void> remoteVideo(bool available);

  /// Simulates the OS taking the camera (`true`) or giving it back (`false`).
  Future<void> cameraBlocked(bool blocked);
  Future<void> reset();
}

final class CallxPreview {
  CallxPreview() {
    final backend = _PreviewBackend();
    callx = Callx(backend: backend);
    simulator = backend;
  }
  late final Callx callx;
  late final CallxSimulator simulator;
}

final class _PreviewBackend implements CallxBackend, CallxSimulator {
  static const _accountGeneration = 'preview-generation-1';
  final Map<String, ({String fingerprint, CommandResult result})> _operations =
      {};
  final _events = StreamController<CallSnapshot>.broadcast(sync: true);
  final _callEvents = StreamController<CallEvent>.broadcast(sync: true);
  final List<CallEvent> _journal = [];
  final List<CallEvent> _pendingSessionEvents = [];
  String? _activeSessionId;
  BigInt _acknowledged = BigInt.zero;
  int _sessionCounter = 0;
  CallSnapshot _snapshot = const CallSnapshot(sequence: '0');
  BigInt _sequence = BigInt.zero;
  bool _ready = false;
  bool _disposed = false;

  /// A phone's built-in outputs, so route UI can be previewed.
  static const _routes = [
    AudioRoute(id: 'earpiece', kind: AudioRouteKind.earpiece, name: 'Phone'),
    AudioRoute(id: 'speaker', kind: AudioRouteKind.speaker, name: 'Speaker'),
  ];

  /// The chosen camera; the call shows it only while the camera is not off, like native.
  CameraFacing? _facing;

  void _guard({bool requireSetup = true}) {
    if (_disposed) {
      throw const CallxException('disposed', 'Preview has been disposed.');
    }
    if (requireSetup && !_ready) {
      throw const CallxException('notConfigured', 'Call setup first.');
    }
  }

  @override
  Future<CallxCapabilities> setup([
    CallxConfig config = const CallxConfig(),
  ]) async {
    _guard(requireSetup: false);
    _ready = true;
    return const CallxCapabilities(
      coreVersion: 'preview',
      execution: ExecutionMode.preview,
      accountGeneration: _accountGeneration,
      nativeCalling: false,
      durableReplay: false,
      providerManagedSignaling: false,
      hold: true,
      mute: true,
      video: true,
      dtmf: true,
    );
  }

  void _commit(Call? call) {
    _sequence += BigInt.one;
    _snapshot = CallSnapshot(sequence: _sequence.toString(), call: call);
    _appendEvent(CallEventKind.callChanged, callId: call?.callId);
    _events.add(_snapshot);
  }

  void _appendEvent(CallEventKind kind, {String? callId, String? operationId}) {
    final event = CallEvent(
      eventId: 'preview-event-$_sequence',
      sequence: _sequence.toString(),
      kind: kind,
      source: CallEventSource.local,
      observedAtMs: DateTime.now().millisecondsSinceEpoch,
      callId: callId,
      operationId: operationId,
    );
    _journal.add(event);
    if (_journal.length > 2048) _journal.removeAt(0);
    if (_activeSessionId != null && !_callEvents.hasListener) {
      _pendingSessionEvents.add(event);
    }
    _callEvents.add(event);
  }

  Call _requireCall([String? id]) {
    _guard();
    final call = _snapshot.call;
    if (call == null || (id != null && call.callId != id)) {
      throw const CallxException('callNotFound', 'Call not found.');
    }
    if (call.state == CallState.ended) {
      throw const CallxException('invalidState', 'Call has ended.');
    }
    return call;
  }

  void _create(CallInput input, CallDirection direction) {
    _guard();
    _facing = null;
    if (input.callId.trim().isEmpty ||
        input.displayName.trim().isEmpty ||
        input.handle.trim().isEmpty) {
      throw const CallxException(
        'invalidArgument',
        'callId, displayName and handle are required.',
      );
    }
    if (_snapshot.call != null && _snapshot.call!.state != CallState.ended) {
      throw const CallxException('busy', 'One live call is supported.');
    }
    _commit(
      Call(
        callId: input.callId,
        displayName: input.displayName,
        direction: direction,
        state: direction == CallDirection.incoming
            ? CallState.incoming
            : CallState.outgoing,
        video: input.video,
        audioRoutes: _routes,
        audioRoute: _routes.first.id,
        createdAtMs: DateTime.now().millisecondsSinceEpoch,
      ),
    );
  }

  @override
  Future<CommandResult> execute(CallCommand command) async {
    _guard();
    final fingerprint =
        '${command.type.name}|${command.callId ?? command.input?.callId}|'
        '${command.input?.displayName}|${command.value}|${command.facing}|'
        '${command.text}';
    final previous = _operations[command.operationId];
    if (previous != null) {
      if (previous.fingerprint == fingerprint) return previous.result;
      return CommandResult(
        operationId: command.operationId,
        status: CommandStatus.rejected,
        execution: ExecutionMode.preview,
        completedAtMs: DateTime.now().millisecondsSinceEpoch,
        error: const OperationError(
          code: CallxErrorCode.conflict,
          message: 'operationId was already used with different arguments.',
          retryable: false,
        ),
      );
    }
    if (command.type == CommandType.startCall) {
      if (command.input == null) {
        throw const CallxException('invalidArgument', 'input is required.');
      }
      _create(command.input!, CallDirection.outgoing);
    } else {
      if (command.callId == null) {
        throw const CallxException('invalidArgument', 'callId is required.');
      }
      final call = _requireCall(command.callId);
      switch (command.type) {
        case CommandType.answer:
          if (call.state != CallState.incoming) {
            throw const CallxException(
              'invalidState',
              'Only incoming calls can be answered.',
            );
          }
          _commit(
            call.copyWith(
              state: CallState.connecting,
              acceptedAtMs: DateTime.now().millisecondsSinceEpoch,
            ),
          );
        case CommandType.end:
          _commit(
            call.copyWith(
              state: CallState.ended,
              mediaReady: false,
              localVideo: LocalVideo.off,
              remoteVideo: false,
              audioRoutes: const [],
              endedAtMs: DateTime.now().millisecondsSinceEpoch,
              endReason: call.state == CallState.incoming
                  ? EndReason.declined
                  : EndReason.localHangup,
            ),
          );
        case CommandType.setCamera:
        case CommandType.switchCamera:
          if (call.state != CallState.connecting &&
              call.state != CallState.active &&
              call.state != CallState.held) {
            throw const CallxException(
              'invalidState',
              'Answer before using the camera.',
            );
          }
          if (command.type == CommandType.switchCamera) {
            if (command.facing == null) {
              throw const CallxException(
                'invalidArgument',
                'facing is required.',
              );
            }
            _facing = command.facing;
            _commit(call.copyWith(cameraFacing: command.facing));
          } else {
            if (command.value == null) {
              throw const CallxException(
                'invalidArgument',
                'value is required.',
              );
            }
            _facing ??= CameraFacing.front;
            _commit(
              call.copyWith(
                localVideo: command.value! ? LocalVideo.on : LocalVideo.off,
                cameraFacing: _facing,
              ),
            );
          }
        case CommandType.setAudioRoute:
          if (call.state == CallState.incoming) {
            throw const CallxException('invalidState', 'Answer first.');
          }
          if (!call.audioRoutes.any((route) => route.id == command.text)) {
            throw const CallxException(
              'invalidArgument',
              'Use a route from audioRoutes.',
            );
          }
          _commit(call.copyWith(audioRoute: command.text));
        case CommandType.sendDtmf:
          if ((command.text ?? '').isEmpty ||
              (command.text ?? '').length > 32 ||
              RegExp(r'[^0-9*#]').hasMatch(command.text ?? '')) {
            throw const CallxException(
              'invalidArgument',
              'digits must be 1-32 of 0-9, * and #.',
            );
          }
          if (call.state != CallState.active) {
            throw const CallxException('invalidState', 'Tones need media.');
          }
        case CommandType.setDisplayName:
          if ((command.text ?? '').isEmpty) {
            throw const CallxException(
              'invalidArgument',
              'displayName is required.',
            );
          }
          _commit(call.copyWith(displayName: command.text));
        case CommandType.setMuted:
        case CommandType.setHeld:
          if (command.value == null) {
            throw const CallxException('invalidArgument', 'value is required.');
          }
          if (call.state != CallState.active && call.state != CallState.held) {
            throw const CallxException(
              'invalidState',
              'Wait for simulated media connection.',
            );
          }
          _commit(
            command.type == CommandType.setMuted
                ? call.copyWith(muted: command.value)
                : call.copyWith(
                    state: command.value! ? CallState.held : CallState.active,
                  ),
          );
        case CommandType.startCall:
          throw const CallxException(
            'invalidArgument',
            'Unexpected startCall.',
          );
      }
    }
    final result = CommandResult(
      operationId: command.operationId,
      status: CommandStatus.applied,
      execution: ExecutionMode.preview,
      completedAtMs: DateTime.now().millisecondsSinceEpoch,
    );
    _operations[command.operationId] = (
      fingerprint: fingerprint,
      result: result,
    );
    _sequence += BigInt.one;
    _snapshot = CallSnapshot(
      sequence: _sequence.toString(),
      call: _snapshot.call,
    );
    _appendEvent(
      CallEventKind.operationCompleted,
      operationId: command.operationId,
    );
    return result;
  }

  @override
  Future<OperationLookup> queryOperation(
    String operationId,
    String accountGeneration,
  ) async {
    _guard();
    if (accountGeneration != _accountGeneration) {
      return OperationLookup(
        operationId: operationId,
        accountGeneration: accountGeneration,
        status: OperationLookupStatus.generationMismatch,
      );
    }
    final result = _operations[operationId]?.result;
    return OperationLookup(
      operationId: operationId,
      accountGeneration: accountGeneration,
      status: result == null
          ? OperationLookupStatus.unavailable
          : OperationLookupStatus.available,
      result: result,
    );
  }

  @override
  Future<ObservationSession> openSession([String? afterSequence]) async {
    _guard();
    var status = afterSequence == null
        ? SessionOpenStatus.fresh
        : SessionOpenStatus.resumed;
    var replay = <CallEvent>[];
    if (afterSequence != null) {
      final after = BigInt.tryParse(afterSequence);
      if (after == null ||
          after.isNegative ||
          after.toString() != afterSequence) {
        throw const CallxException('invalidArgument', 'Invalid sequence.');
      }
      final earliest = _journal.isEmpty
          ? _sequence + BigInt.one
          : BigInt.parse(_journal.first.sequence);
      if (after > _sequence || after + BigInt.one < earliest) {
        status = SessionOpenStatus.resynced;
      } else {
        replay = _journal
            .where((event) => BigInt.parse(event.sequence) > after)
            .toList(growable: false);
      }
    }
    _activeSessionId = 'preview-session-${++_sessionCounter}';
    _pendingSessionEvents.clear();
    _acknowledged = BigInt.zero;
    return ObservationSession(
      sessionId: _activeSessionId!,
      accountGeneration: _accountGeneration,
      status: status,
      snapshot: ObservationSnapshot(
        watermark: _sequence.toString(),
        calls: _snapshot.call == null ? const [] : [_snapshot.call!],
      ),
      replay: replay,
    );
  }

  @override
  Stream<CallEvent> eventsFor(String sessionId) {
    _guard();
    if (_activeSessionId != sessionId) {
      throw const CallxException(
        'invalidArgument',
        'Observation session is not active.',
      );
    }
    return Stream<CallEvent>.multi((controller) {
      for (final event in _pendingSessionEvents) {
        controller.add(event);
      }
      _pendingSessionEvents.clear();
      final subscription = _callEvents.stream.listen(
        controller.add,
        onError: controller.addError,
        onDone: controller.close,
      );
      controller.onCancel = subscription.cancel;
    }, isBroadcast: true);
  }

  @override
  Future<void> acknowledge(String sessionId, String throughSequence) async {
    _guard();
    final value = BigInt.tryParse(throughSequence);
    if (_activeSessionId != sessionId ||
        value == null ||
        value.isNegative ||
        value.toString() != throughSequence ||
        value < _acknowledged ||
        value > _sequence) {
      throw const CallxException(
        'invalidArgument',
        'Invalid session acknowledgement.',
      );
    }
    _acknowledged = value;
  }

  @override
  Future<void> closeSession(String sessionId) async {
    _guard();
    if (_activeSessionId == sessionId) {
      _activeSessionId = null;
      _pendingSessionEvents.clear();
    }
  }

  @override
  Future<CallSnapshot> getSnapshot() async {
    _guard(requireSetup: false);
    return _snapshot;
  }

  /// The preview has no push transport.
  @override
  Future<PushToken?> pushToken() async => null;

  @override
  Stream<CallSnapshot> get snapshots {
    _guard(requireSetup: false);
    return Stream<CallSnapshot>.multi((controller) {
      // No async boundary between initial snapshot and registering the change listener.
      controller.add(_snapshot);
      final sub = _events.stream.listen(
        controller.add,
        onError: controller.addError,
        onDone: controller.close,
      );
      controller.onCancel = sub.cancel;
    }, isBroadcast: true);
  }

  @override
  Future<void> incoming(CallInput input) async =>
      _create(input, CallDirection.incoming);
  @override
  Future<void> remoteAnswered() async {
    final call = _requireCall();
    if (call.state != CallState.outgoing) {
      throw const CallxException(
        'invalidState',
        'Only outgoing calls can be remotely answered.',
      );
    }
    _commit(
      call.copyWith(
        state: CallState.connecting,
        acceptedAtMs: DateTime.now().millisecondsSinceEpoch,
      ),
    );
  }

  @override
  Future<void> mediaConnected() async {
    final call = _requireCall();
    if (call.state != CallState.connecting) {
      throw const CallxException(
        'invalidState',
        'Answer before connecting media.',
      );
    }
    _commit(
      call.copyWith(
        state: CallState.active,
        mediaReady: true,
        mediaConnectedAtMs: DateTime.now().millisecondsSinceEpoch,
      ),
    );
  }

  @override
  Future<void> remoteEnded() async {
    final call = _requireCall();
    _commit(
      call.copyWith(
        state: CallState.ended,
        mediaReady: false,
        localVideo: LocalVideo.off,
        remoteVideo: false,
        audioRoutes: const [],
        endedAtMs: DateTime.now().millisecondsSinceEpoch,
        endReason: EndReason.remoteEnded,
      ),
    );
  }

  @override
  Future<void> remoteVideo(bool available) async {
    _commit(_requireCall().copyWith(remoteVideo: available));
  }

  @override
  Future<void> cameraBlocked(bool blocked) async {
    final call = _requireCall();
    if (blocked && call.localVideo == LocalVideo.on) {
      _commit(call.copyWith(localVideo: LocalVideo.blocked));
    } else if (!blocked && call.localVideo == LocalVideo.blocked) {
      _commit(call.copyWith(localVideo: LocalVideo.on));
    }
  }

  @override
  Future<void> reset() async {
    _guard();
    _commit(null);
  }

  @override
  Future<void> dispose() async {
    if (_disposed) return;
    _disposed = true;
    await _events.close();
    await _callEvents.close();
  }
}
