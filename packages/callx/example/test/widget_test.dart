import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:callx_flutter_example/main.dart';
import 'package:callx_flutter_example/call_screen.dart';
import 'package:callx/callx.dart';

void main() {
  testWidgets(
    'phone call screen keeps controls separate from diagnostics and uses app branding',
    (tester) async {
      tester.view.physicalSize = const Size(360, 640);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      var returned = false;
      await tester.pumpWidget(
        MaterialApp(
          home: CallScreen(
            call: const Call(
              callId: 'screen-1',
              displayName: 'hao.dev7',
              direction: CallDirection.incoming,
              state: CallState.active,
            ),
            nativeVideo: false,
            brand: const CallBrand(
              backgroundColor: Colors.indigo,
              logo: Text('App logo'),
            ),
            onBack: () => returned = true,
            controls: [
              FilledButton(onPressed: () {}, child: const Text('End call')),
            ],
          ),
        ),
      );
      expect(find.text('App logo'), findsOneWidget);
      expect(find.text('Event log'), findsNothing);
      expect(tester.takeException(), isNull);
      await tester.tap(find.byTooltip('Minimize call'));
      expect(returned, isTrue);
    },
  );
  testWidgets('preview controls walk through a call without native APIs', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(1200, 1200);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(const CallxDemoApp());
    await tester.pumpAndSettle();
    expect(find.text('Simulated calls'), findsOneWidget);
    Future<void> tap(String label) async {
      final text = find.text(label);
      final target = text.evaluate().isEmpty ? find.byTooltip(label) : text;
      await tester.ensureVisible(target);
      await tester.tap(target);
      await tester.pumpAndSettle();
    }

    await tap('Incoming call');
    expect(find.text('Incoming call'), findsOneWidget);
    expect(find.byType(CallScreen), findsNothing);
    expect(find.text('Simulated calls'), findsOneWidget);
    expect(find.text('Event log'), findsNothing);
    await tap('Answer');
    expect(find.text('Connecting…'), findsOneWidget);
    expect(find.byType(CallScreen), findsOneWidget);
    await tap('Minimize call');
    expect(find.text('Simulated calls'), findsOneWidget);
    await tap('Diagnostics');
    await tap('Connect media');
    await tap('hao.dev7');
    expect(find.text('Connected'), findsOneWidget);
    await tap('Mute');
    expect(find.text('Unmute'), findsOneWidget);
    await tap('Hold');
    expect(find.text('On hold'), findsOneWidget);
    await tap('Resume');
    await tap('End call');
    expect(find.text('Call ended'), findsOneWidget);
    if (find.text('Diagnostics').evaluate().isNotEmpty) {
      await tap('Diagnostics');
    }
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
    expect(find.text('Calls on this device'), findsOneWidget);
    await tester.tap(find.text('Diagnostics'));
    await tester.pumpAndSettle();
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
