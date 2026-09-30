import 'package:callx_livekit/callx_livekit.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  final calls = <MethodCall>[];
  setUp(() {
    calls.clear();
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(
      const MethodChannel('dev.callx.livekit'), (call) async { calls.add(call); return null; });
  });

  test('configure sends the token URL and headers to the native adapter', () async {
    await CallxLiveKit.configure(const LiveKitConfig(
      tokenUrl: 'https://api.example.com/livekit-token', headers: {'authorization': 'Bearer x'}));
    expect(calls.single.method, 'configure');
    expect(calls.single.arguments, {'tokenUrl': 'https://api.example.com/livekit-token',
      'headers': {'authorization': 'Bearer x'}});
  });

  test('a token URL that is not http(s) is refused before reaching native code', () async {
    expect(() => CallxLiveKit.configure(const LiveKitConfig(tokenUrl: 'wss://media.example.com')), throwsArgumentError);
    expect(calls, isEmpty);
  });

  test('reset forgets the credential source', () async {
    await CallxLiveKit.reset();
    expect(calls.single.method, 'reset');
  });
}
