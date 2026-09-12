import 'dart:convert';
import 'dart:io';
import 'package:callx/callx.dart';
import 'package:callx/callx_preview.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
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
