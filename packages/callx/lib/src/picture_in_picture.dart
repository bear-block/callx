import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

/// Picture-in-picture for video calls on Android and iOS 15+ (ADR-0010 addendum).
///
/// On Android the whole app enters picture-in-picture, so show a compact layout (usually the remote
/// [CallxVideoView] alone) while [changes] reports true. The Android app declares
/// `android:supportsPictureInPicture="true"` on its activity.
/// iOS uses a separate native video-call window; keep an inline [CallxVideoView] mounted
/// and enable the audio background mode. Camera continuity depends on device support.
abstract final class CallxPictureInPicture {
  static const _methods = MethodChannel('dev.callx/pip');
  static Stream<bool>? _changes;
  static const _events = EventChannel('dev.callx/pip/events');

  static bool get _supportedPlatform =>
      !kIsWeb &&
      (defaultTargetPlatform == TargetPlatform.android ||
          defaultTargetPlatform == TargetPlatform.iOS);

  /// With [automatic], the app enters picture-in-picture when the user leaves it during a video
  /// call (Android 12+ or iOS 15+).
  static Future<void> configure({required bool automatic}) async {
    if (!_supportedPlatform) return;
    await _methods.invokeMethod<void>('configure', {'automatic': automatic});
  }

  /// Enters picture-in-picture now. False where the device or the app does not allow it.
  static Future<bool> enter() async =>
      _supportedPlatform &&
      (await _methods.invokeMethod<bool>('enter') ?? false);

  /// True while the app is in picture-in-picture.
  static Stream<bool> get changes => _supportedPlatform
      ? (_changes ??= _events.receiveBroadcastStream().map(
          (value) => value == true,
        ))
      : const Stream.empty();
}
