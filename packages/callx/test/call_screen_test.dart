import 'package:callx/callx.dart';
import 'package:callx/callx_ui.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

const connected = Call(
  callId: 'one',
  displayName: 'Steven',
  direction: CallDirection.incoming,
  state: CallState.active,
  mediaReady: true,
  remoteVideo: true,
  localVideo: LocalVideo.on,
  cameraFacing: CameraFacing.front,
);

void main() {
  testWidgets(
    'remote fills screen; local preview uses cover and front mirror; paused video restores brand',
    (tester) async {
      final sources = <(VideoSource, VideoFit, bool)>[];
      Widget screen(Call call) => MaterialApp(
        home: CallxCallScreen(
          call: call,
          controls: const [],
          onBack: () {},
          nativeVideo: true,
          brand: const CallxCallBrand(logo: Text('Host logo')),
          videoBuilder: (_, _, source, fit, mirror) {
            sources.add((source, fit, mirror));
            return ColoredBox(
              color: source == VideoSource.remote ? Colors.blue : Colors.green,
            );
          },
        ),
      );
      await tester.pumpWidget(screen(connected));
      expect(sources, [
        (VideoSource.remote, VideoFit.cover, false),
        (VideoSource.local, VideoFit.cover, true),
      ]);
      sources.clear();
      await tester.pumpWidget(
        screen(
          connected.copyWith(
            remoteVideo: false,
            localVideo: LocalVideo.blocked,
          ),
        ),
      );
      expect(sources, isEmpty);
      expect(find.text('Host logo'), findsOneWidget);
      expect(find.text('Camera paused'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'controls expose accessibility state and dispatch only explicit gestures',
    (tester) async {
      var actions = 0;
      final semantics = tester.ensureSemantics();
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Row(
              children: [
                CallxCallControl(
                  label: 'Mute',
                  icon: const Icon(Icons.mic),
                  selected: true,
                  onPressed: () => actions++,
                ),
                const CallxCallControl(
                  label: 'Hold',
                  icon: Icon(Icons.pause),
                  onPressed: null,
                ),
              ],
            ),
          ),
        ),
      );
      expect(actions, 0);
      await tester.tap(find.text('Mute'));
      await tester.tap(find.text('Hold'));
      expect(actions, 1);
      expect(
        tester.getSemantics(find.bySemanticsLabel('Mute')),
        matchesSemantics(
          label: 'Mute',
          isButton: true,
          hasEnabledState: true,
          isEnabled: true,
          hasSelectedState: true,
          isSelected: true,
          hasTapAction: true,
        ),
      );
      semantics.dispose();
    },
  );

  for (final size in [const Size(320, 640), const Size(640, 320)]) {
    testWidgets(
      'controls and end action remain reachable at $size with large text',
      (tester) async {
        await tester.binding.setSurfaceSize(size);
        addTearDown(() => tester.binding.setSurfaceSize(null));
        var ended = false;
        await tester.pumpWidget(
          MaterialApp(
            home: MediaQuery(
              data: MediaQueryData(
                size: size,
                textScaler: TextScaler.linear(2),
              ),
              child: CallxCallScreen(
                call: connected.copyWith(
                  localVideo: LocalVideo.off,
                  remoteVideo: false,
                ),
                nativeVideo: false,
                onBack: () {},
                statusLabel: 'Custom connected status',
                elapsed: const Text('00:12'),
                controls: List.generate(
                  6,
                  (i) => CallxCallControl(
                    label: 'Control $i',
                    icon: const Icon(Icons.call),
                    onPressed: () {},
                  ),
                ),
                endControl: CallxCallControl(
                  label: 'End call',
                  icon: const Icon(Icons.call_end),
                  destructive: true,
                  onPressed: () => ended = true,
                ),
              ),
            ),
          ),
        );
        expect(tester.takeException(), isNull);
        await tester.ensureVisible(find.text('End call'));
        await tester.pumpAndSettle();
        await tester.tap(find.text('End call'));
        expect(ended, isTrue);
        expect(tester.takeException(), isNull);
      },
    );
  }
  testWidgets(
    'compact video controls hide while idle and reveal without sending commands',
    (tester) async {
      var ended = false;
      await tester.pumpWidget(
        MaterialApp(
          home: CallxCallScreen(
            call: connected,
            nativeVideo: true,
            controlsTimeout: const Duration(seconds: 2),
            videoBuilder: (_, _, _, _, _) =>
                const ColoredBox(color: Colors.blue),
            onBack: () {},
            controls: [
              CallxCallControl(
                compact: true,
                label: 'Mute',
                icon: const Icon(Icons.mic),
                onPressed: () {},
              ),
            ],
            endControl: CallxCallControl(
              compact: true,
              label: 'End call',
              destructive: true,
              icon: const Icon(Icons.call_end),
              onPressed: () => ended = true,
            ),
          ),
        ),
      );
      expect(tester.getSize(find.byType(IconButton).last), const Size(58, 58));
      expect(find.byTooltip('End call').hitTestable(), findsOneWidget);
      final endPosition = tester.getCenter(find.byTooltip('End call'));
      expect(
        (endPosition.dy - tester.getCenter(find.byTooltip('Mute')).dy).abs(),
        lessThan(.01),
      );
      await tester.pump(const Duration(seconds: 3));
      expect(find.byTooltip('End call').hitTestable(), findsNothing);
      expect(ended, isFalse);
      await tester.tapAt(endPosition);
      await tester.pump();
      expect(find.byTooltip('End call').hitTestable(), findsOneWidget);
      expect(ended, isFalse);
      await tester.tap(find.byTooltip('End call'));
      expect(ended, isTrue);
      await tester.pumpWidget(const SizedBox());
    },
  );

  testWidgets('screen reader and pinned controls keep video actions visible', (
    tester,
  ) async {
    for (final reader in [false, true]) {
      await tester.pumpWidget(
        MaterialApp(
          home: MediaQuery(
            data: MediaQueryData(accessibleNavigation: reader),
            child: CallxCallScreen(
              call: connected,
              nativeVideo: true,
              controlsPinned: !reader,
              onBack: () {},
              controls: const [],
              videoBuilder: (_, _, _, _, _) => const SizedBox(),
              endControl: CallxCallControl(
                compact: true,
                label: 'End call',
                icon: const Icon(Icons.call_end),
                onPressed: () {},
              ),
            ),
          ),
        ),
      );
      await tester.pump(const Duration(seconds: 8));
      expect(find.byTooltip('End call').hitTestable(), findsOneWidget);
    }
  });
  testWidgets(
    'compact video actions stay on screen in landscape without scrolling',
    (tester) async {
      const size = Size(640, 320);
      await tester.binding.setSurfaceSize(size);
      addTearDown(() => tester.binding.setSurfaceSize(null));
      await tester.pumpWidget(
        MaterialApp(
          home: MediaQuery(
            data: const MediaQueryData(
              size: size,
              padding: EdgeInsets.only(top: 24, bottom: 32),
            ),
            child: CallxCallScreen(
              call: connected,
              nativeVideo: true,
              controlsPinned: true,
              leadingControls: CallxCallControl(
                compact: true,
                label: 'Hold',
                icon: const Icon(Icons.pause),
                onPressed: () {},
              ),
              onBack: () {},
              elapsed: const Text('00:12'),
              videoBuilder: (_, _, _, _, _) =>
                  const ColoredBox(color: Colors.blue),
              controls: [
                CallxCallControl(
                  compact: true,
                  label: 'Mute',
                  icon: const Icon(Icons.mic),
                  onPressed: () {},
                ),
              ],
              endControl: CallxCallControl(
                compact: true,
                label: 'End call',
                icon: const Icon(Icons.call_end),
                onPressed: () {},
              ),
            ),
          ),
        ),
      );
      final end = tester.getRect(find.byTooltip('End call'));
      expect(end.bottom, lessThanOrEqualTo(size.height - 32));
      expect(end.top, greaterThanOrEqualTo(24));
      expect(find.byTooltip('End call').hitTestable(), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets('foreground return restores controls for a fresh timeout', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: CallxCallScreen(
          call: connected,
          nativeVideo: true,
          controlsTimeout: const Duration(seconds: 2),
          controls: const [],
          onBack: () {},
          videoBuilder: (_, _, _, _, _) => const SizedBox(),
          endControl: CallxCallControl(
            compact: true,
            label: 'End call',
            icon: const Icon(Icons.call_end),
            onPressed: () {},
          ),
        ),
      ),
    );
    await tester.pump(const Duration(seconds: 3));
    expect(find.byTooltip('End call').hitTestable(), findsNothing);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
    await tester.pump(const Duration(seconds: 10));
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pump();
    expect(find.byTooltip('End call').hitTestable(), findsOneWidget);
    await tester.pump(const Duration(seconds: 1));
    expect(find.byTooltip('End call').hitTestable(), findsOneWidget);
    await tester.pump(const Duration(seconds: 2));
    expect(find.byTooltip('End call').hitTestable(), findsNothing);
  });

  testWidgets(
    'local preview anchors to the top safe area independently of header height',
    (tester) async {
      await tester.binding.setSurfaceSize(const Size(390, 844));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      await tester.pumpWidget(
        MaterialApp(
          home: MediaQuery(
            data: const MediaQueryData(
              size: Size(390, 844),
              padding: EdgeInsets.only(top: 24, bottom: 32),
            ),
            child: CallxCallScreen(
              call: connected,
              nativeVideo: true,
              controls: const [],
              onBack: () {},
              header: const SizedBox(height: 200),
              videoBuilder: (_, _, source, _, _) =>
                  SizedBox(key: ValueKey(source)),
            ),
          ),
        ),
      );
      final preview = tester.getRect(
        find.byKey(const ValueKey(VideoSource.local)),
      );
      // The media surface sits inside the preview's one-pixel border.
      expect(preview.top, 45);
      expect(preview.right, 369);
      expect(preview.size, const Size(94, 138));
      expect(tester.takeException(), isNull);
    },
  );
}
