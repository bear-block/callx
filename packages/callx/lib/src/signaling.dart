import 'package:flutter/services.dart';

import '../callx.dart';

/// Backend events your Dart signaling client receives (ADR-0014): pass them to Callx so the
/// call follows. They are the same ingress calls native host code makes.
///
/// They work while the Flutter engine runs. For a call that rings while the app was killed,
/// prefer a native signaling client, and keep the backend's invitation expiry as the backstop.
/// Needs the native pipeline started with `CallxPlugin.bootstrap`; otherwise they throw
/// [CallxException] with code `notConfigured`.
abstract final class CallxSignaling {
  static const _methods = MethodChannel('dev.callx/methods');

  /// The callee accepted this device's outgoing call (`call.accepted`). True when the call
  /// moved to [CallState.connecting]; media starts and the call becomes active once it flows.
  static Future<bool> remoteAnswered(String callId) =>
      _invoke('remoteAnswered', {'callId': callId});

  /// The backend ended the call (`call.ended`): [reason] is from this device's point of view,
  /// for example [EndReason.callerCancelled] or [EndReason.answeredElsewhere]. True when a live
  /// call ended; for a call that has not rung yet, Callx records the ID so it never rings.
  static Future<bool> remoteEnded(
    String callId, {
    EndReason reason = EndReason.remoteEnded,
  }) => _invoke('remoteEnded', {'callId': callId, 'reason': reason.name});

  static Future<bool> _invoke(
    String method,
    Map<String, Object?> arguments,
  ) async {
    try {
      return await _methods.invokeMethod<bool>(method, arguments) ?? false;
    } on PlatformException catch (error) {
      throw CallxException(
        error.code,
        error.message ?? 'Native Callx operation failed.',
      );
    } on MissingPluginException {
      throw const CallxException(
        'nativeUnavailable',
        'Callx native plugin is not registered.',
      );
    }
  }
}
