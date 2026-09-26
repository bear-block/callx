# Changelog

## Unreleased

- Own the incoming path in BYO signaling mode ([ADR-0007](https://github.com/bear-block/callx/blob/main/docs/adr/0007-library-owned-incoming-path.md)):
  `CallKitIngress` receives VoIP pushes, reports calls to CallKit (honouring iOS 26.4
  `mustReport`) and ends unanswered calls; `TelecomIngress` takes forwarded FCM data,
  registers the Telecom call and shows a CallStyle notification with answer and decline.
  Invitations use the `call.invited` schema v1 decoder.
- Android call notification: always carries a full-screen intent (the launcher Activity
  by default), falls back to a plain notification when the system rejects CallStyle,
  follows answers and hangups from Dart/JS, and covers outgoing calls.
- `TelecomIngress.handlePush` returns only after the call rings or is rejected, inside
  FCM's processing window, and reports delivered and original FCM priority.
- Telecom system callbacks get a four-second budget; mute and hold from other surfaces
  (car, headset, watch, call waiting) reach the coordinator on both platforms, and
  `requestAudioEndpoint` routes audio through Telecom.
- Ended call IDs never ring again: the coordinator keeps a terminal ledger, records a
  cancel that arrives before its invitation, and rejects `startCall` with an ended ID.
- Answers and hangups from the system UI are recorded in the coordinator.
- Host API: `reportIncoming` returns an `IncomingOutcome`; `remoteEnded` and
  `remoteAnswered` return whether the call changed.
- Android: the library declares a notification action receiver and depends on
  `androidx.core:core` 1.13.1.
- Fix Android events never reaching JS when the host configures or replaces the runtime
  after the module initialized; listeners now attach on each JS subscription.
- Fix iOS `dispose()` stopping event delivery for every other `Callx` instance.
- Reject command deadlines more than 30 seconds ahead with `invalidArgument`, as the
  contract requires.
- Stop shipping the test-only `ContractValidator` and Android's unused action registry.
- Document how hosts assemble the platform executors and reconcile work left pending
  by a previous process, plus error codes, end reasons and input limits.
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
