import 'dart:convert';
import 'dart:io';
import 'package:callx/callx.dart';
import 'package:callx/callx_preview.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
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
      await callx.setup(const CallxConfig(appName: 'Acme'));
      const input = CallInput(callId: 'call-1', displayName: 'hao.dev7');
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
      Callx().setup(const CallxConfig(appName: 'Acme')),
      throwsA(
        isA<CallxException>().having(
          (e) => e.code,
          'code',
          'nativeNotImplemented',
        ),
      ),
    );
  });
  test('caller operationId survives wrapper and result', () async {
    final preview = CallxPreview();
    await preview.callx.setup(const CallxConfig(appName: 'Acme'));
    await preview.simulator.incoming(
      const CallInput(callId: 'a', displayName: 'A'),
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
    final capabilities = await preview.callx.setup(
      const CallxConfig(appName: 'Acme'),
    );
    await preview.simulator.incoming(
      const CallInput(callId: 'a', displayName: 'A'),
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
      await preview.callx.setup(const CallxConfig(appName: 'Acme'));
      await preview.simulator.incoming(
        const CallInput(callId: 'a', displayName: 'A'),
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
  test('empty operationId fails before transport execution', () async {
    final preview = CallxPreview();
    await preview.callx.setup(const CallxConfig(appName: 'Acme'));
    await expectLater(
      preview.callx.startCall(
        const CallInput(callId: 'a', displayName: 'A'),
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
    const input = CallInput(callId: 'a', displayName: 'A');
    await expectLater(
      preview.simulator.incoming(input),
      error('notConfigured'),
    );
    await preview.callx.setup(const CallxConfig(appName: 'Acme'));
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
      await preview.callx.setup(const CallxConfig(appName: 'Acme'));
      await preview.simulator.incoming(
        const CallInput(callId: 'a', displayName: 'A'),
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
}
