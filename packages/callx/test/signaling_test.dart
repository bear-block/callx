import 'package:callx/callx.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const channel = MethodChannel('dev.callx/methods');
  final calls = <MethodCall>[];
  Object? reply = true;

  setUp(() {
    calls.clear();
    reply = true;
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, (call) async {
          calls.add(call);
          if (reply is PlatformException) throw reply!;
          return reply;
        });
  });
  tearDown(
    () => TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, null),
  );

  test('backend events reach the native ingress with their reason', () async {
    expect(await CallxSignaling.remoteAnswered('call-1'), isTrue);
    expect(
      await CallxSignaling.remoteEnded(
        'call-1',
        reason: EndReason.callerCancelled,
      ),
      isTrue,
    );
    expect(await CallxSignaling.remoteEnded('call-2'), isTrue);
    expect(calls.map((call) => call.method), [
      'remoteAnswered',
      'remoteEnded',
      'remoteEnded',
    ]);
    expect(calls[0].arguments, {'callId': 'call-1'});
    expect(calls[1].arguments, {
      'callId': 'call-1',
      'reason': 'callerCancelled',
    });
    expect(calls[2].arguments, {'callId': 'call-2', 'reason': 'remoteEnded'});
  });

  test('a missing bootstrap surfaces as notConfigured', () async {
    reply = PlatformException(code: 'notConfigured', message: 'not started');
    expect(
      () => CallxSignaling.remoteAnswered('call-1'),
      throwsA(
        isA<CallxException>().having((e) => e.code, 'code', 'notConfigured'),
      ),
    );
  });
}
