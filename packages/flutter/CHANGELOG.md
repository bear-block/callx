# Changelog

## Unreleased

- Fix Android reporting an answered incoming call as declined when it is ended.
- Fix native `acknowledge` and `closeSession` always failing with `internal`.
- `snapshots` listeners now share the active observation session instead of each
  replacing it, so several listeners and a manual session work together.
- Document the Android `minSdk = 29` requirement for host apps.
- Fix iOS system-originated action completion without SDK operation correlation.
- Invalidate pending action records on timeout/reset and forward CallKit audio
  activation/deactivation through an optional native media handler.
- Verified with native core tests, iOS simulator regression tests and package builds;
  physical device/media acceptance remains separate.

## 0.0.0-preview.1

Typed Dart API, explicit simulator, native MethodChannel/EventChannel transport and Android/iOS
plugin entry points.

- Align public vocabulary, command options/results and call milestones with contract 0.1.0.
- Vendor the canonical Swift/Kotlin coordinator, durable journal and platform adapters.
- Add host-configured native runtime, operation lookup, observation sessions and signaling/media ingress.
- Keep unwired hosts fail-closed with `nativeCalling: false` and `notConfigured`.
