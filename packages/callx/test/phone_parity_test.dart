import 'package:callx/callx.dart';
import 'package:callx/callx_preview.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test(
    'phone routes and names change by command; tones leave call state alone',
    () async {
      final preview = CallxPreview();
      final callx = preview.callx;
      expect((await callx.setup()).dtmf, isTrue);
      await preview.simulator.incoming(
        const CallInput(
          callId: 'call-1',
          displayName: 'Steven',
          handle: 'steven',
        ),
      );
      await expectLater(
        callx.sendDtmf('call-1', '1'),
        throwsA(isA<CallxException>()),
      );
      await callx.answer('call-1');
      await preview.simulator.mediaConnected();
      final before = (await callx.getSnapshot()).call!;
      expect(before.audioRoutes, isNotEmpty);
      await expectLater(
        callx.setAudioRoute('call-1', 'gone'),
        throwsA(isA<CallxException>()),
      );
      expect(
        (await callx.setAudioRoute('call-1', 'speaker')).status,
        CommandStatus.applied,
      );
      expect((await callx.getSnapshot()).call!.audioRoute, 'speaker');
      final session = await callx.openSession();
      final events = <CallEventKind>[];
      final subscription = callx
          .eventsFor(session.sessionId)
          .listen((event) => events.add(event.kind));
      await callx.sendDtmf('call-1', '*12#');
      await Future<void>.delayed(Duration.zero);
      expect(events, [CallEventKind.operationCompleted]);
      await expectLater(
        callx.sendDtmf('call-1', 'abc'),
        throwsA(isA<CallxException>()),
      );
      await callx.setDisplayName('call-1', 'hao.dev7');
      expect((await callx.getSnapshot()).call!.displayName, 'hao.dev7');
      await callx.end('call-1');
      expect((await callx.getSnapshot()).call!.audioRoutes, isEmpty);
      expect((await callx.getSnapshot()).call!.audioRoute, isNull);
      await subscription.cancel();
      await callx.dispose();
    },
  );
}
