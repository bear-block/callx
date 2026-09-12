/// Memory-only UX simulator: no OS UI, audio, push, network or durable replay.
library;

import 'dart:async';
import 'callx.dart';

abstract interface class CallxSimulator {
  Future<void> incoming(CallInput input);
  Future<void> remoteAnswered();
  Future<void> mediaConnected();
  Future<void> remoteEnded();
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
  final _events = StreamController<CallSnapshot>.broadcast(sync: true);
  CallSnapshot _snapshot = const CallSnapshot(sequence: '0');
  BigInt _sequence = BigInt.zero;
  int _operation = 0;
  bool _ready = false;
  bool _disposed = false;

  void _guard({bool requireSetup = true}) {
    if (_disposed) {
      throw const CallxException('disposed', 'Preview has been disposed.');
    }
    if (requireSetup && !_ready) {
      throw const CallxException('notConfigured', 'Call setup first.');
    }
  }

  @override
  Future<CallxCapabilities> setup(CallxConfig config) async {
    _guard(requireSetup: false);
    if (config.appName.trim().isEmpty) {
      throw const CallxException('invalidArgument', 'appName is required.');
    }
    _ready = true;
    return const CallxCapabilities();
  }

  void _commit(Call? call) {
    _sequence += BigInt.one;
    _snapshot = CallSnapshot(sequence: _sequence.toString(), call: call);
    _events.add(_snapshot);
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
    if (input.callId.trim().isEmpty || input.displayName.trim().isEmpty) {
      throw const CallxException(
        'invalidArgument',
        'callId and displayName are required.',
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
      ),
    );
  }

  @override
  Future<CommandResult> execute(CallCommand command) async {
    _guard();
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
          _commit(call.copyWith(state: CallState.connecting));
        case CommandType.end:
          _commit(
            call.copyWith(
              state: CallState.ended,
              mediaReady: false,
              endReason: call.state == CallState.incoming
                  ? EndReason.declined
                  : EndReason.localHangup,
            ),
          );
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
    return CommandResult('preview-op-${++_operation}');
  }

  @override
  Future<CallSnapshot> getSnapshot() async {
    _guard(requireSetup: false);
    return _snapshot;
  }

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
    _commit(call.copyWith(state: CallState.connecting));
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
    _commit(call.copyWith(state: CallState.active, mediaReady: true));
  }

  @override
  Future<void> remoteEnded() async {
    final call = _requireCall();
    _commit(
      call.copyWith(
        state: CallState.ended,
        mediaReady: false,
        endReason: EndReason.remoteEnded,
      ),
    );
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
  }
}
