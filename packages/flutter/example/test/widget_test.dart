import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:callx_flutter_example/main.dart';

void main() {
  testWidgets('preview controls walk through a call without native APIs', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(1200, 1200);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(const CallxDemoApp());
    await tester.pumpAndSettle();
    expect(find.textContaining('PREVIEW ONLY'), findsOneWidget);
    Future<void> tap(String label) async {
      final target = find.text(label);
      await tester.ensureVisible(target);
      await tester.tap(target);
      await tester.pumpAndSettle();
    }

    await tap('Incoming call');
    expect(find.text('INCOMING'), findsOneWidget);
    await tap('Answer');
    expect(find.text('CONNECTING'), findsOneWidget);
    expect(find.text('○ Media not connected'), findsOneWidget);
    await tap('Connect media');
    expect(find.text('ACTIVE'), findsOneWidget);
    await tap('Mute');
    expect(find.text('Unmute'), findsOneWidget);
    await tap('Hold');
    expect(find.text('HELD'), findsOneWidget);
    await tap('Resume');
    await tap('End call');
    expect(find.text('ENDED'), findsOneWidget);
    expect(find.text('Reason: localHangup'), findsOneWidget);
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pumpAndSettle();
  });

  testWidgets('device mode appears when the native runtime is configured', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(1200, 1600);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final messenger =
        TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
    const callx = MethodChannel('dev.callx/methods');
    const events = EventChannel('dev.callx/events');
    const hostChannel = MethodChannel('callx_example/host');
    final hostCalls = <MethodCall>[];
    messenger.setMockMethodCallHandler(callx, (call) async {
      switch (call.method) {
        case 'setup':
          return <String, Object?>{
            'coreVersion': '0.1.0',
            'execution': 'native',
            'accountGeneration': 'demo-account-1',
            'nativeCalling': true,
            'durableReplay': true,
            'providerManagedSignaling': false,
            'hold': true,
            'mute': true,
          };
        case 'openSession':
          return <String, Object?>{
            'sessionId': 'session-1',
            'accountGeneration': 'demo-account-1',
            'status': 'fresh',
            'snapshot': {'watermark': '0', 'calls': <Object?>[]},
            'replay': <Object?>[],
          };
        case 'getSnapshot':
          return <String, Object?>{'sequence': '0', 'call': null};
      }
      return null;
    });
    messenger.setMockStreamHandler(
      events,
      MockStreamHandler.inline(onListen: (_, _) {}),
    );
    messenger.setMockMethodCallHandler(hostChannel, (call) async {
      hostCalls.add(call);
      if (call.method == 'status') {
        return <String, Object?>{
          'platform': 'android',
          'pushReady': true,
          'pushToken': 'fcm-token-123',
          'events': ['runtime configured'],
          'endpoints': <Object?>[],
        };
      }
      return null;
    });
    addTearDown(() {
      messenger.setMockMethodCallHandler(callx, null);
      messenger.setMockStreamHandler(events, null);
      messenger.setMockMethodCallHandler(hostChannel, null);
    });

    await tester.pumpWidget(const CallxDemoApp());
    await tester.pumpAndSettle();
    expect(find.textContaining('DEVICE TRIAL'), findsOneWidget);
    expect(find.text('fcm-token-123'), findsOneWidget);
    final incoming = find.text('Incoming (local signaling)');
    await tester.ensureVisible(incoming);
    await tester.tap(incoming);
    await tester.pumpAndSettle();
    final invite = hostCalls.singleWhere((call) => call.method == 'incoming');
    expect((invite.arguments as Map)['displayName'], 'hao.dev7');
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pumpAndSettle();
  });
}
