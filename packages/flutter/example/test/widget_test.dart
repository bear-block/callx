import 'package:flutter/material.dart';
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
}
