import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

/// The user asked the system to call someone through this app (ADR-0013): from iOS Recents, a
/// contact card or Siri, or the Call back button of an Android missed-call notification.
///
/// It is not a call yet. Look up [handle], then call `Callx.startCall` if the app agrees.
final class CallRequest {
  const CallRequest({
    required this.handle,
    this.displayName,
    this.video = false,
  });

  /// The handle of the earlier call or the contact, as your app reported it.
  final String handle;

  /// The name the system showed, when it had one.
  final String? displayName;

  /// The user asked for a video call.
  final bool video;
}

/// Call requests from outside the app. A request that launched the app is held natively for 60
/// seconds, so listen early, for example in `main`.
abstract final class CallxCallRequests {
  static const _events = EventChannel('dev.callx/call_requests');
  static Stream<CallRequest>? _requests;

  /// Each request once, including one waiting from before the first listener.
  static Stream<CallRequest> get requests =>
      !kIsWeb &&
          (defaultTargetPlatform == TargetPlatform.android ||
              defaultTargetPlatform == TargetPlatform.iOS)
      ? (_requests ??= _events.receiveBroadcastStream().map((value) {
          final map = (value as Map).cast<Object?, Object?>();
          return CallRequest(
            handle: map['handle']! as String,
            displayName: map['displayName'] as String?,
            video: map['video'] == true,
          );
        }))
      : const Stream.empty();
}
