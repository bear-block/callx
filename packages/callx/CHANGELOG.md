# Changelog

## 3.0.0 — publication pending

- Adds observed audio routes and `setAudioRoute`, active-call `sendDtmf`, and `setDisplayName`.
- Adds system call request handoff from iOS activities and Android missed-call callback actions.
- iOS reports outgoing connecting time and optionally donates answered calls for system suggestions.
- Contract moves to 0.3.0; native continues accepting 0.1/0.2 envelopes. Rebuild the native app.
- Custom executors/backends with exhaustive command switches must handle the three new cases.
- TypeScript custom backends must report `dtmf`; optional DTMF adapter support does not change the adapter API version.
- Physical Bluetooth, Recents and Siri acceptance remains pending.

## 0.2.4 — 2026-10-04

- Add experimental iOS 15+ native video-call PiP using existing configuration, entry and listener APIs.
- Add native fallback branding, remote/local selection and restore/call-end surface cleanup.
- No call-contract changes. iOS host background/camera capabilities and physical-device acceptance still apply.

## 0.2.3 — 2026-10-04

- Transparent camera-switch icon with a 48dp touch target; example Homes identify Steven and hao.dev7 separately.

- Compact video action row with idle auto-hide, accessibility/reduced-motion support and customization; Equal 58dp controls including the end action, direct top-left Hold and top-anchored local preview. Foreground return resets the five-second timeout. Examples use automatic Android PiP when leaving the app and mini-call when leaving the call overlay, with no PiP button in the action row.

- Respect device safe areas in examples and Android native call screens; fix journal pruning crashing on Android API 33.

- Add reusable call controls and configurable voice/video layouts, preview placement, header and end-call slots; refresh example Home and Diagnostics.

- Android native locked-call screen: keep timer and call controls visible after Answer;
  Open app explicitly requests unlock. Add circular mute/hold/audio controls driven by
  the native coordinator and Telecom, with configurable native labels.

### Breaking changes and migration

No removed public API or contract change. The supplied video screen now hides controls
after five idle seconds and uses a revised layout. Set autoHideControls to false for persistent
controls, and review safe areas and custom control sizes. Upgrade core and adapters together.
Full release notes and migration: https://bear-block.github.io/callx/project/changelog

## 0.2.2 — 2026-10-02

- Optional call UI: root overlay, call screen, app-branded mini-call and a presentation
  controller. Incoming stays on Home until accept; minimizing preserves native call/media
  state and ending removes the UI. UI remains separate from the native call contract.

- Android PiP: `CallxPictureInPicture.configure`, `enter` and `changes`; automatic entry on
  Android 12+ follows live video calls. iOS entry returns false.

- Video calls (ADR-0010): contract 0.2.0 with `video`, `localVideo`, `cameraFacing` and
  `remoteVideo` on calls, `setCamera` and `switchCamera`, and `video: true` on invitations and
  `startCall`. `CallxVideoView` shows a call's video. Media adapter API 2 (`CallxVideoAdapter`)
  carries video; API 1 adapters keep working.
- `setup()` takes no arguments. `appName` was validated and then never used: the call screens
  show the app's display name (`CFBundleDisplayName`, `android:label`). `CallxConfig.appName` is
  deprecated and ignored, so existing `setup(CallxConfig(appName: ...))` calls keep working.

## 0.1.3

- Android 10–12: calls rang only on Android 13 and later. The Telecom check looked for
  `FEATURE_TELECOM`, which exists only from API 33; earlier versions are now checked for
  `FEATURE_CONNECTION_SERVICE`, so bootstrap no longer fails there with "Telecom is unavailable".
- Android: if Telecom no longer has the app's PhoneAccount when a call arrives (for example,
  removed late after a quick reinstall), the core registers again and retries once instead of
  dropping the call. Telecom refusals are now logged under the `Callx` tag with the error type
  and code, and no caller data.

## 0.1.1

- Republished with the other packages at 0.1.1; no code changes since 0.1.0.

## 0.1.0

First public release. Highlights: library-owned incoming path (PushKit and FCM), CallKit and
Core-Telecom, durable journal and recovery, one-call native bootstrap, media adapter interface.
Details below; release notes: https://bear-block.github.io/callx/project/changelog

- `Callx.pushToken()` returns the device's push token (`voip` on iOS, `fcm` on Android) for your
  backend; `CallxBootstrap` records the PushKit token, the FCM service reports its token to
  `CallxPushTokens`.
- `CallxPlugin.bootstrap` start the whole native pipeline in one call through
  `CallxBootstrap` (ADR-0009): Telecom or CallKit, ingress, durable coordinator, recovery,
  PushKit and media.
- `CallxMediaAdapter` and `CallxMediaSink`: one media interface on Android and iOS. The ingress
  starts and stops the adapter with each call; installed adapters are discovered from a
  `dev.callx.media.<provider>` manifest entry (Android) or `CallxMediaAdapterFactories`
  (Info.plist). More than one media adapter is refused.
- iOS: `CallKitIngressListener.callAnswered(callID:)` and `callEnded(callID:)` tell the host to
  start and stop media once per call, from CallKit, the app or the remote side;
  `CallKitActionLifecycle.observeAppliedActions` reports every fulfilled action.
- `Call.mediaInterrupted` and native `BridgeRuntime.mediaInterrupted`: report that connected
  media dropped (for example while the media SDK reconnects) without changing the call;
  `mediaConnected` clears it.
- `TelecomIngressListener.onCallAnswered` and `onCallEnded` tell the host to start and
  stop media once per call, whichever surface answered or ended it.
- The example host joins a LiveKit room per call for real audio in device trials
  ([ADR-0008](https://bear-block.github.io/callx/project/decisions)).
- Android incoming calls use a versioned ringtone channel and repeat ringing until
  answered, ended or silenced; ongoing calls use a silent channel. Native incoming UI
  forwards volume-down to `TelecomIngress.silenceIncoming`.
- `CallStylePresenter` drops its `channelName` parameter: channel names are
  `CallNotificationLabels.incomingChannel` and `ongoingChannel`. The old `callx_calls`
  channel is deleted.
- Expose `CallxTelecomAvailability` so hosts can reject unsupported devices before
  registering with Telecom.

- Own the incoming path in BYO signaling mode ([ADR-0007](https://bear-block.github.io/callx/project/decisions)):
  `CallKitIngress` receives VoIP pushes, reports calls to CallKit (honouring iOS 26.4
  `mustReport`) and ends unanswered calls; `TelecomIngress` takes forwarded FCM data,
  registers the Telecom call and shows a CallStyle notification with answer and decline.
  Invitations use the `call.invited` schema v1 decoder.
- Android call notification: always carries a full-screen intent, falls back to a plain
  notification when the system rejects CallStyle, follows answers and hangups from
  Dart/JS, and covers outgoing calls.
- Android `CallxIncomingCallActivity`: the default full-screen incoming-call screen, in
  plain Android views so it shows over the lock screen without waiting for the Dart/JS
  engine. The notification's answer button opens it instead of a broadcast receiver, so
  answering can open the app on Android 12+. The ongoing call notification shows a
  running timer from the answer time. The library manifest declares
  `USE_FULL_SCREEN_INTENT` and `MANAGE_OWN_CALLS`, so hosts no longer need to.
- Android `LockedAnswer`: answering while locked either requires unlocking before the app
  opens (the default, as on iOS, with a native call screen on the lock screen meanwhile)
  or opens the app above the lock screen until the call ends (`CallxLockScreen.onIntent`).
  `CallxFullScreenIntent` reports whether Android 14+ denied full-screen intents.
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
- Reject command deadlines more than 30 seconds ahead with `invalidArgument`, as the
  contract requires.
- Stop shipping the test-only `ContractValidator` and Android's unused action registry.
- Document how hosts assemble the platform executors and reconcile work left pending
  by a previous process, plus error codes, end reasons and input limits.
- Fix Android reporting an answered incoming call as declined when it is ended.
- Fix native `acknowledge` and `closeSession` always failing with `internal`.
- `snapshots` listeners now share the active observation session instead of each
  replacing it, so several listeners and a manual session work together.
- Document the Android `minSdk = 29` requirement for host apps.
- Support Swift Package Manager on iOS; CocoaPods builds the same sources.
- Support AGP 9 built-in Kotlin and the new Android DSL. The plugin applies the
  Kotlin Gradle plugin only when the host has not enabled built-in Kotlin.
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
