import 'package:callx/callx.dart';
import 'package:callx/callx_ui.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

Call call(CallState state, [String id = 'one']) => Call(
  callId: id,
  displayName: 'Caller',
  direction: CallDirection.incoming,
  state: state,
);
void main() {
  test(
    'incoming stays hidden; accept presents once; minimize survives call updates',
    () {
      final ui = CallxPresentationController();
      ui.update(call(CallState.incoming));
      ui.expand();
      ui.minimize();
      expect(ui.mode, CallPresentation.hidden);
      ui.update(call(CallState.connecting));
      expect(ui.mode, CallPresentation.expanded);
      ui.minimize();
      ui.update(call(CallState.active));
      ui.update(call(CallState.held));
      expect(ui.mode, CallPresentation.minimized);
      ui.expand();
      expect(ui.mode, CallPresentation.expanded);
      ui.update(call(CallState.ended));
      ui.expand();
      expect(ui.mode, CallPresentation.hidden);
      ui.update(call(CallState.incoming, 'two'));
      expect(ui.mode, CallPresentation.hidden);
      ui.update(call(CallState.active, 'two'));
      expect(ui.mode, CallPresentation.expanded);
      ui.update(null);
      expect(ui.mode, CallPresentation.hidden);
      ui.dispose();
    },
  );
  test('outgoing and a new call reset minimized presentation', () {
    final ui = CallxPresentationController();
    ui.update(call(CallState.outgoing));
    expect(ui.mode, CallPresentation.expanded);
    ui.minimize();
    ui.update(call(CallState.outgoing, 'two'));
    expect(ui.mode, CallPresentation.expanded);
    ui.dispose();
  });
  testWidgets(
    'root overlay keeps Home mounted and system Back minimizes without ending',
    (tester) async {
      final ui = CallxPresentationController()..update(call(CallState.active));
      var count = 0;
      await tester.pumpWidget(
        MaterialApp(
          home: ListenableBuilder(
            listenable: ui,
            builder: (_, _) => CallxCallOverlay(
              onMinimize: ui.minimize,
              expanded: ui.mode == CallPresentation.expanded
                  ? const Material(child: Text('Call'))
                  : null,
              minimized: ui.mode == CallPresentation.minimized
                  ? CallxMiniCall(
                      displayName: 'Caller',
                      onExpand: ui.expand,
                      onEnd: () {},
                    )
                  : null,
              child: StatefulBuilder(
                builder: (_, setState) => TextButton(
                  onPressed: () => setState(() => count++),
                  child: Text('Home $count'),
                ),
              ),
            ),
          ),
        ),
      );
      expect(find.text('Home 0'), findsOneWidget);
      await tester.binding.handlePopRoute();
      await tester.pumpAndSettle();
      expect(ui.mode, CallPresentation.minimized);
      await tester.tap(find.text('Home 0'));
      await tester.pump();
      expect(find.text('Home 1'), findsOneWidget);
      await tester.tap(find.text('Caller'));
      await tester.pumpAndSettle();
      expect(ui.mode, CallPresentation.expanded);
      expect(find.text('Home 1'), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
      ui.dispose();
    },
  );
  testWidgets('mini-call preview cannot steal its expand gesture', (
    tester,
  ) async {
    var expanded = false;
    var previewTapped = false;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: CallxMiniCall(
            displayName: 'Caller',
            onExpand: () => expanded = true,
            onEnd: () {},
            preview: GestureDetector(
              onTap: () => previewTapped = true,
              child: const ColoredBox(
                color: Colors.blue,
                child: Center(child: Text('Preview')),
              ),
            ),
          ),
        ),
      ),
    );
    await tester.tapAt(tester.getCenter(find.text('Preview')));
    await tester.pump();
    expect(expanded, isTrue);
    expect(previewTapped, isFalse);
  });
}
