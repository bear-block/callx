import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

/// Picture-in-picture for video calls (ADR-0010 addendum). Android only for now: on other
/// platforms [enter] returns false and [changes] never emits.
///
/// The whole app enters picture-in-picture, so show a compact layout (usually the remote
/// [CallxVideoView] alone) while [changes] reports true. The Android app declares
/// `android:supportsPictureInPicture="true"` on its activity.
abstract final class CallxPictureInPicture {
  static const _methods = MethodChannel('dev.callx/pip');
  static Stream<bool>? _changes;
  static const _events = EventChannel('dev.callx/pip/events');

  static bool get _android =>
      !kIsWeb && defaultTargetPlatform == TargetPlatform.android;

  /// With [automatic], the app enters picture-in-picture when the user leaves it during a video
  /// call (Android 12 and later).
  static Future<void> configure({required bool automatic}) async {
    if (!_android) return;
    await _methods.invokeMethod<void>('configure', {'automatic': automatic});
  }

  /// Enters picture-in-picture now. False where the device or the app does not allow it.
  static Future<bool> enter() async =>
      _android && (await _methods.invokeMethod<bool>('enter') ?? false);

  /// True while the app is in picture-in-picture.
  static Stream<bool> get changes => _android
      ? (_changes ??= _events.receiveBroadcastStream().map((value) => value == true))
      : const Stream.empty();
}
