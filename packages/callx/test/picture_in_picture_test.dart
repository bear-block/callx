import 'package:callx/callx.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const channel = MethodChannel('dev.callx/pip');
  const events = EventChannel('dev.callx/pip/events');
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
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockStreamHandler(events, null);
  });

  test('Android configuration and entry reach the native host', () async {
    debugDefaultTargetPlatformOverride = TargetPlatform.android;
    await CallxPictureInPicture.configure(automatic: true);
    expect(await CallxPictureInPicture.enter(), isTrue);
    expect(calls.map((call) => call.method), ['configure', 'enter']);
    expect(calls.first.arguments, {'automatic': true});
  });

  test(
    'iOS configuration and entry reach the native video-call host',
    () async {
      debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
      await CallxPictureInPicture.configure(automatic: true);
      expect(await CallxPictureInPicture.enter(), isTrue);
      expect(calls.map((call) => call.method), ['configure', 'enter']);
    },
  );

  test('desktop PiP does not invoke a missing channel', () async {
    debugDefaultTargetPlatformOverride = TargetPlatform.macOS;
    await CallxPictureInPicture.configure(automatic: true);
    expect(await CallxPictureInPicture.enter(), isFalse);
    expect(await CallxPictureInPicture.changes.toList(), isEmpty);
    expect(calls, isEmpty);
  });

  test('iOS mode changes arrive through the native PiP stream', () async {
    debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
    var cancelled = false;
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockStreamHandler(
          events,
          MockStreamHandler.inline(
            onListen: (_, sink) {
              sink.success(false);
              sink.success(true);
            },
            onCancel: (_) {
              cancelled = true;
            },
          ),
        );
    expect(await CallxPictureInPicture.changes.take(2).toList(), [false, true]);
    await Future<void>.delayed(Duration.zero);
    expect(cancelled, isTrue);
  });
}
