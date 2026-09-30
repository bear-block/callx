/// LiveKit media adapter for callx (ADR-0009). Installing this package is the whole integration:
/// callx's native bootstrap discovers the adapter and joins the call's LiveKit room when a call is
/// answered, even while Dart is not running. Dart only configures where room credentials come from.
library;

import 'package:flutter/services.dart';

/// Where the adapter gets room credentials. It sends `POST tokenUrl` with [headers] and
/// `{"callId": "..."}`; your backend authenticates the user, checks call membership and answers
/// `{"url": "wss://...", "token": "..."}`.
final class LiveKitConfig {
  const LiveKitConfig({required this.tokenUrl, this.headers = const {}});
  final String tokenUrl;

  /// For example an authorization header. Stored encrypted (Android Keystore, iOS keychain).
  final Map<String, String> headers;

  /// Throws [ArgumentError] for a URL that is not http(s).
  void validate() {
    final uri = Uri.tryParse(tokenUrl);
    if (uri == null || !(uri.isScheme('https') || uri.isScheme('http')) || uri.host.isEmpty) {
      throw ArgumentError.value(tokenUrl, 'tokenUrl', 'must be an http(s) URL');
    }
  }
}

abstract final class CallxLiveKit {
  static const _channel = MethodChannel('dev.callx.livekit');

  /// Persist the credential source. Call after sign-in and whenever the session token changes.
  static Future<void> configure(LiveKitConfig config) async {
    config.validate();
    await _channel.invokeMethod<void>('configure', {'tokenUrl': config.tokenUrl, 'headers': config.headers});
  }

  /// Forget the credential source, for example on sign-out.
  static Future<void> reset() => _channel.invokeMethod<void>('reset');
}
