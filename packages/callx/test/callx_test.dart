import 'dart:convert';
import 'dart:io';
import 'package:callx/callx.dart';
import 'package:callx/callx_preview.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test('public vocabulary matches the canonical v0 manifest', () {
    final manifest =
        jsonDecode(File('../../contracts/v0/manifest.json').readAsStringSync())
            as Map<String, dynamic>;
    expect(contractVersion, manifest['contractVersion']);
    expect(CallState.values.map((value) => value.name), manifest['callStates']);
    expect(EndReason.values.map((value) => value.name), manifest['endReasons']);
    expect(
      CommandStatus.values.map((value) => value.name),
      manifest['commandStatuses'],
    );
    expect(
      CallxErrorCode.values.map((value) => value.name),
      manifest['errorCodes'],
    );
  });

  final scenarios =
      jsonDecode(
            File('../../contracts/preview-scenarios.json').readAsStringSync(),
          )
          as List;
  for (final scenario in scenarios) {
    test(scenario['name'] as String, () async {
      final preview = CallxPreview();
      final callx = preview.callx;
      final simulator = preview.simulator;
      await callx.setup();
      const input = CallInput(
        callId: 'call-1',
        displayName: 'hao.dev7',
        handle: 'sip:hao.dev7@example.invalid',
      );
      final actions = <String, Future<Object?> Function()>{
        'incoming': () => simulator.incoming(input),
        'startCall': () => callx.startCall(input),
        'answer': () => callx.answer(input.callId),
        'end': () => callx.end(input.callId),
        'mediaConnected': simulator.mediaConnected,
        'remoteAnswered': simulator.remoteAnswered,
        'remoteEnded': simulator.remoteEnded,
        'mute': () => callx.setMuted(input.callId, true),
        'hold': () => callx.setHeld(input.callId, true),
        'resume': () => callx.setHeld(input.callId, false),
      };
      var sequence = BigInt.zero;
      for (final step in scenario['steps'] as List) {
        await actions[step['action']]!();
        final snapshot = await callx.getSnapshot();
        expect(BigInt.parse(snapshot.sequence) > sequence, isTrue);
        sequence = BigInt.parse(snapshot.sequence);
        final values = {
          'state': snapshot.call!.state.name,
          'muted': snapshot.call!.muted,
          'mediaReady': snapshot.call!.mediaReady,
          'endReason': snapshot.call!.endReason?.name,
        };
        for (final key in values.keys) {
          if ((step as Map).containsKey(key)) expect(values[key], step[key]);
        }
      }
      await callx.dispose();
    });
  }
  test('native mode never silently mocks', () async {
    await expectLater(
      Callx().setup(),
      throwsA(
        isA<CallxException>().having(
          (e) => e.code,
          'code',
          'nativeUnavailable',
        ),
      ),
    );
  });

  test('native method channel preserves outgoing command fields', () async {
    const channel = MethodChannel('dev.callx/methods');
    final messenger =
        TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
    Map<Object?, Object?>? captured;
    Map<Object?, Object?>? setupArguments;
    messenger.setMockMethodCallHandler(channel, (call) async {
      if (call.method == 'setup') {
        setupArguments = (call.arguments as Map).cast<Object?, Object?>();
        return <String, Object?>{
          'coreVersion': '0.1.0',
          'execution': 'native',
          'accountGeneration': 'generation-1',
          'nativeCalling': true,
          'durableReplay': true,
          'providerManagedSignaling': false,
          'hold': true,
          'mute': true,
        };
      }
      captured = (call.arguments as Map).cast<Object?, Object?>();
      return <String, Object?>{
        'operationId': captured!['operationId'],
        'status': 'applied',
        'execution': 'native',
        'completedAtMs': 1000,
      };
    });
    addTearDown(() => messenger.setMockMethodCallHandler(channel, null));
    final callx = Callx();
    expect(
      (await callx.setup()).execution,
      ExecutionMode.native,
    );
    expect(setupArguments, {'contractVersion': '0.1.0'});
    // The deprecated appName still compiles and is not sent.
    // ignore: deprecated_member_use_from_same_package
    await callx.setup(const CallxConfig(appName: 'Acme'));
    expect(setupArguments, {'contractVersion': '0.1.0'});
    await callx.startCall(
      const CallInput(
        callId: 'call-1',
        displayName: 'hao.dev7',
        handle: 'sip:hao.dev7@example.invalid',
      ),
      options: const CommandOptions(operationId: 'op-1'),
    );
    expect(captured!['contractVersion'], contractVersion);
    expect(captured!['type'], 'startCall');
    expect((captured!['input'] as Map)['handle'], 'sip:hao.dev7@example.invalid');
  });
  test('caller operationId survives wrapper and result', () async {
    final preview = CallxPreview();
    await preview.callx.setup();
    await preview.simulator.incoming(
      const CallInput(
        callId: 'a',
        displayName: 'A',
        handle: 'sip:a@example.invalid',
      ),
    );
    final result = await preview.callx.answer(
      'a',
      options: const CommandOptions(operationId: 'retry-safe-answer-1'),
    );
    expect(result.operationId, 'retry-safe-answer-1');
    expect(result.contract, contractVersion);
    expect(result.status, CommandStatus.applied);
    expect(result.completedAtMs, isPositive);
  });
  test('same operation is idempotent and its result is queryable', () async {
    final preview = CallxPreview();
    final capabilities = await preview.callx.setup();
    await preview.simulator.incoming(
      const CallInput(
        callId: 'a',
        displayName: 'A',
        handle: 'sip:a@example.invalid',
      ),
    );
    const options = CommandOptions(operationId: 'answer-once');
    final first = await preview.callx.answer('a', options: options);
    final second = await preview.callx.answer('a', options: options);
    expect(identical(second, first), isTrue);
    final lookup = await preview.callx.queryOperation(
      'answer-once',
      capabilities.accountGeneration,
    );
    expect(lookup.status, OperationLookupStatus.available);
    expect(identical(lookup.result, first), isTrue);
    expect(
      (await preview.callx.queryOperation(
        'missing',
        capabilities.accountGeneration,
      )).status,
      OperationLookupStatus.unavailable,
    );
    expect(
      (await preview.callx.queryOperation(
        'answer-once',
        'old-generation',
      )).status,
      OperationLookupStatus.generationMismatch,
    );
  });
  test(
    'reusing operationId with different arguments returns conflict',
    () async {
      final preview = CallxPreview();
      await preview.callx.setup();
      await preview.simulator.incoming(
        const CallInput(
          callId: 'a',
          displayName: 'A',
          handle: 'sip:a@example.invalid',
        ),
      );
      await preview.callx.answer(
        'a',
        options: const CommandOptions(operationId: 'reused'),
      );
      final result = await preview.callx.end(
        'a',
        options: const CommandOptions(operationId: 'reused'),
      );
      expect(result.status, CommandStatus.rejected);
      expect(result.error?.code, CallxErrorCode.conflict);
    },
  );
  test(
    'observation session snapshots, replays and acknowledges events',
    () async {
      final preview = CallxPreview();
      await preview.callx.setup();
      final fresh = await preview.callx.openSession();
      expect(fresh.status, SessionOpenStatus.fresh);
      expect(fresh.replay, isEmpty);
      final live = <CallEvent>[];
      // Event between open and listener attach must be buffered by the session.
      await preview.simulator.incoming(
        const CallInput(
          callId: 'a',
          displayName: 'A',
          handle: 'sip:a@example.invalid',
        ),
      );
      final subscription = preview.callx
          .eventsFor(fresh.sessionId)
          .listen(live.add);
      await preview.callx.answer(
        'a',
        options: const CommandOptions(operationId: 'observed-answer'),
      );
      await Future<void>.delayed(Duration.zero);
      expect(live.map((event) => event.kind), [
        CallEventKind.callChanged,
        CallEventKind.callChanged,
        CallEventKind.operationCompleted,
      ]);
      await preview.callx.acknowledge(fresh.sessionId, live.last.sequence);
      await subscription.cancel();
      await preview.callx.closeSession(fresh.sessionId);
      final resumed = await preview.callx.openSession('0');
      expect(resumed.status, SessionOpenStatus.resumed);
      expect(resumed.replay.map((event) => event.sequence), ['1', '2', '3']);
      expect(resumed.snapshot.watermark, '3');
      expect(resumed.snapshot.calls.single.state, CallState.connecting);
      final resynced = await preview.callx.openSession('999');
      expect(resynced.status, SessionOpenStatus.resynced);
      expect(resynced.replay, isEmpty);
    },
  );
  test('empty operationId fails before transport execution', () async {
    final preview = CallxPreview();
    await preview.callx.setup();
    await expectLater(
      preview.callx.startCall(
        const CallInput(
          callId: 'a',
          displayName: 'A',
          handle: 'sip:a@example.invalid',
        ),
        options: const CommandOptions(operationId: ' '),
      ),
      throwsA(
        isA<CallxException>().having(
          (error) => error.code,
          'code',
          'invalidArgument',
        ),
      ),
    );
    expect((await preview.callx.getSnapshot()).call, isNull);
  });
  test('setup, busy, wrong ID and disposal errors', () async {
    final preview = CallxPreview();
    Matcher error(String code) =>
        throwsA(isA<CallxException>().having((e) => e.code, 'code', code));
    const input = CallInput(
      callId: 'a',
      displayName: 'A',
      handle: 'sip:a@example.invalid',
    );
    await expectLater(
      preview.simulator.incoming(input),
      error('notConfigured'),
    );
    await preview.callx.setup();
    await preview.simulator.incoming(input);
    await expectLater(preview.simulator.incoming(input), error('busy'));
    await expectLater(preview.callx.answer('wrong'), error('callNotFound'));
    await preview.callx.dispose();
    await expectLater(preview.callx.answer('a'), error('disposed'));
  });
  test(
    'new subscription receives snapshot; cancelling does not end call',
    () async {
      final preview = CallxPreview();
      await preview.callx.setup();
      await preview.simulator.incoming(
        const CallInput(
          callId: 'a',
          displayName: 'A',
          handle: 'sip:a@example.invalid',
        ),
      );
      expect(
        (await preview.callx.snapshots.first).call!.state,
        CallState.incoming,
      );
      await preview.callx.answer('a');
      expect(
        (await preview.callx.getSnapshot()).call!.state,
        CallState.connecting,
      );
      await preview.callx.dispose();
    },
  );

  group('native observation sessions', () {
    const methods = MethodChannel('dev.callx/methods');
    const events = EventChannel('dev.callx/events');
    late List<MethodCall> calls;
    late MockStreamHandlerEventSink sink;
    var sessions = 0;
    var sequence = 0;

    setUp(() {
      calls = [];
      sessions = 0;
      sequence = 0;
      final messenger =
          TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
      // Mirrors CallxPlugin: acknowledge/closeSession reply with null.
      messenger.setMockMethodCallHandler(methods, (call) async {
        calls.add(call);
        switch (call.method) {
          case 'openSession':
            sessions++;
            return <String, Object?>{
              'sessionId': 'session-$sessions',
              'accountGeneration': 'generation-1',
              'status': 'fresh',
              'snapshot': {'watermark': '$sequence', 'calls': <Object?>[]},
              'replay': <Object?>[],
            };
          case 'getSnapshot':
            return <String, Object?>{'sequence': '$sequence', 'call': null};
          default:
            return null;
        }
      });
      messenger.setMockStreamHandler(
        events,
        MockStreamHandler.inline(onListen: (_, events) => sink = events),
      );
      addTearDown(() {
        messenger.setMockMethodCallHandler(methods, null);
        messenger.setMockStreamHandler(events, null);
      });
    });

    void emit(String sessionId) {
      sequence++;
      sink.success(<String, Object?>{
        'sessionId': sessionId,
        'eventId': 'event-$sequence',
        'sequence': '$sequence',
        'kind': 'callChanged',
        'source': 'platform',
        'observedAtMs': 1000 + sequence,
      });
    }

    Future<void> settle() => Future<void>.delayed(Duration.zero);

    test('acknowledge and closeSession accept a void native reply', () async {
      final callx = Callx();
      await callx.acknowledge('session-1', '3');
      await callx.closeSession('session-1');
      expect(calls.map((c) => c.method), ['acknowledge', 'closeSession']);
      expect(calls.first.arguments, {
        'sessionId': 'session-1',
        'throughSequence': '3',
      });
    });

    test(
      'snapshot observers share the app session and keep updating',
      () async {
        final callx = Callx();
        final session = await callx.openSession();
        final first = <String>[];
        final second = <String>[];
        final a = callx.snapshots.listen((s) => first.add(s.sequence));
        final b = callx.snapshots.listen((s) => second.add(s.sequence));
        await settle();
        emit(session.sessionId);
        await settle();

        expect(sessions, 1, reason: 'observers must not replace the session');
        expect(first, ['0', '1']);
        expect(second, ['0', '1']);
        await callx.acknowledge(session.sessionId, '1');

        await a.cancel();
        await b.cancel();
        expect(
          calls.where((c) => c.method == 'closeSession'),
          isEmpty,
          reason: 'the app owns its session',
        );
      },
    );

    test('observers open, reopen and release their own session', () async {
      final callx = Callx();
      final seen = <String>[];
      final subscription = callx.snapshots.listen((s) => seen.add(s.sequence));
      await settle();
      expect(sessions, 1);

      final app = await callx.openSession();
      await callx.closeSession(app.sessionId);
      expect(sessions, 3, reason: 'observers need a live session after close');
      emit('session-3');
      await settle();
      expect(seen.last, '1');

      await subscription.cancel();
      expect(calls.last.method, 'closeSession');
      expect(calls.last.arguments, {'sessionId': 'session-3'});
    });
  });
}
