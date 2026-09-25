# Changelog

## Unreleased

- Fix Android reporting an answered incoming call as declined when it is ended.
- `observe` listeners now share the active observation session instead of each
  replacing it, and subscribe to events before reading the first snapshot.
- The Expo plugin raises Android `minSdkVersion` to 29 when it is lower; RN CLI
  setup documents the same requirement.
- Fix iOS system-originated action completion, invalidate pending records on
  timeout/reset, and expose native audio activation/deactivation callbacks.
  Verified with native tests and iOS package builds; device/media acceptance remains separate.
- Add the optional Expo 57 config plugin at `@bear-block/callx/app.plugin` for
  microphone text, audio/VoIP background modes, explicit APNs environment and base
  Android permissions. Host push/signaling/media implementation remains required.
- Document RN CLI/Expo setup and a BYO backend/signaling/push integration recipe.

## 0.0.0-preview.1

Typed API, explicit simulator, lazy native transport, event emitter, and Android/iOS autolinking
entry points.

- Align public vocabulary, command envelopes/results and call milestones with contract 0.1.0.
- Vendor the canonical Swift/Kotlin coordinator, durable journal and platform adapters.
- Add host-configured native runtime, operation lookup, observation sessions and signaling/media ingress.
- Keep unwired hosts fail-closed with `nativeCalling: false` and `notConfigured`.
