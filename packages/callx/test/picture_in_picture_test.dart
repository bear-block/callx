import 'package:callx/callx.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const channel = MethodChannel('dev.callx/pip');
  final calls = <MethodCall>[];

  setUp(() {
    calls.clear();
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, (call) async {
          calls.add(call);
          return call.method == 'enter' ? true : null;
        });
  });
  tearDown(() {
    debugDefaultTargetPlatformOverride = null;
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, null);
  });

  test('Android configuration and entry reach the native host', () async {
    debugDefaultTargetPlatformOverride = TargetPlatform.android;
    await CallxPictureInPicture.configure(automatic: true);
    expect(await CallxPictureInPicture.enter(), isTrue);
    expect(calls.map((call) => call.method), ['configure', 'enter']);
    expect(calls.first.arguments, {'automatic': true});
  });

  test('iOS PiP is unsupported without invoking a missing channel', () async {
    debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
    await CallxPictureInPicture.configure(automatic: true);
    expect(await CallxPictureInPicture.enter(), isFalse);
    expect(await CallxPictureInPicture.changes.toList(), isEmpty);
    expect(calls, isEmpty);
  });
}
