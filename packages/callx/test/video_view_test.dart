import 'package:callx/callx.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('CallxVideoView passes its source to the native view', (
    tester,
  ) async {
    debugDefaultTargetPlatformOverride = TargetPlatform.android;
    try {
      await tester.pumpWidget(
        const Directionality(
          textDirection: TextDirection.ltr,
          child: CallxVideoView(
            callId: 'call-1',
            source: VideoSource.local,
            mirror: true,
          ),
        ),
      );
      final view = tester.widget<AndroidView>(find.byType(AndroidView));
      expect(view.viewType, 'dev.callx/video');
      expect(view.creationParams, {
        'callId': 'call-1',
        'source': 'local',
        'fit': 'cover',
        'mirror': true,
      });
    } finally {
      debugDefaultTargetPlatformOverride = null;
    }
  });

  testWidgets('other platforms render nothing', (tester) async {
    debugDefaultTargetPlatformOverride = TargetPlatform.macOS;
    try {
      await tester.pumpWidget(const CallxVideoView(callId: 'call-1'));
      expect(find.byType(AndroidView), findsNothing);
      expect(find.byType(UiKitView), findsNothing);
    } finally {
      debugDefaultTargetPlatformOverride = null;
    }
  });
}
