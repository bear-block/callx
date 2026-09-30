// Runs the example's Device mode against the platform's real CallKit or Core-Telecom.
//
//   fvm flutter test integration_test/device_trial_test.dart -d <device-id>
//
// It covers the native call path without push or media: the host's local invitation takes the
// same ingress as a push, and media readiness is simulated.
import 'package:callx_flutter_example/main.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  // CallKit in the iOS Simulator ends every call immediately; these trials need a device there.
  Future<bool> skipOnIosSimulator() async {
    final status = await DeviceHost().status();
    if (!status.simulator) return false;
    markTestSkipped(
      'CallKit ends calls immediately in the iOS Simulator; run on a device.',
    );
    return true;
  }

  Future<void> waitFor(
    WidgetTester tester,
    Finder finder, {
    int seconds = 15,
  }) async {
    for (var i = 0; i < seconds * 10; i++) {
      await tester.pump(const Duration(milliseconds: 100));
      if (finder.evaluate().isNotEmpty) return;
    }
    fail('Timed out waiting for $finder');
  }

  // A disabled button ignores taps, and buttons stay disabled while the previous action runs.
  Future<void> tap(WidgetTester tester, String label) async {
    final target = find.text(label);
    await waitFor(tester, target);
    final button = find.ancestor(
      of: target,
      matching: find.byWidgetPredicate((w) => w is ButtonStyleButton),
    );
    for (
      var i = 0;
      i < 150 &&
          tester.widget<ButtonStyleButton>(button.first).onPressed == null;
      i++
    ) {
      await tester.pump(const Duration(milliseconds: 100));
    }
    expect(
      tester.widget<ButtonStyleButton>(button.first).onPressed,
      isNotNull,
      reason: '$label stayed disabled',
    );
    await tester.ensureVisible(target);
    await tester.pump();
    await tester.tap(target);
  }

  testWidgets(
    'incoming call rings, answers, connects and ends through the platform',
    (tester) async {
      if (await skipOnIosSimulator()) return;
      await tester.pumpWidget(const CallxDemoApp());
      await waitFor(tester, find.textContaining('DEVICE TRIAL'));

      await tap(tester, 'Incoming (local signaling)');
      await waitFor(tester, find.text('INCOMING'));
      // Leaves time to inspect the platform call and notification from the host machine.
      debugPrint('CALLX_TRIAL ringing');
      await tester.pump(const Duration(seconds: 6));

      await tap(tester, 'Answer');
      await waitFor(tester, find.text('CONNECTING'));
      await tap(tester, 'Media connected (simulated)');
      await waitFor(tester, find.text('ACTIVE'));

      await tap(tester, 'Hold');
      await waitFor(tester, find.text('HELD'));
      await tap(tester, 'Resume');
      await waitFor(tester, find.text('ACTIVE'));

      await tap(tester, 'End call');
      await waitFor(tester, find.text('Reason: localHangup'));
      debugPrint('CALLX_TRIAL ended');
    },
  );

  testWidgets('declining ends the call as declined', (tester) async {
    if (await skipOnIosSimulator()) return;
    await tester.pumpWidget(const CallxDemoApp());
    await waitFor(tester, find.textContaining('DEVICE TRIAL'));
    await tap(tester, 'Incoming (local signaling)');
    await waitFor(tester, find.text('INCOMING'));
    await tap(tester, 'Decline');
    await waitFor(tester, find.text('Reason: declined'));
  });

  testWidgets('caller cancel stops ringing', (tester) async {
    if (await skipOnIosSimulator()) return;
    await tester.pumpWidget(const CallxDemoApp());
    await waitFor(tester, find.textContaining('DEVICE TRIAL'));
    await tap(tester, 'Incoming (local signaling)');
    await waitFor(tester, find.text('INCOMING'));
    await tap(tester, 'Caller cancels');
    await waitFor(tester, find.text('Reason: callerCancelled'));
  });

  testWidgets('outgoing call connects when the remote side answers', (
    tester,
  ) async {
    if (await skipOnIosSimulator()) return;
    await tester.pumpWidget(const CallxDemoApp());
    await waitFor(tester, find.textContaining('DEVICE TRIAL'));
    await tap(tester, 'Start outgoing');
    await waitFor(tester, find.text('OUTGOING'));
    await tap(tester, 'Remote answers');
    await waitFor(tester, find.text('CONNECTING'));
    await tap(tester, 'Remote ends');
    await waitFor(tester, find.text('Reason: remoteEnded'));
  });
}
