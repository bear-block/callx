# Changelog

## Unreleased

- Optional call UI: root overlay, call screen, app-branded mini-call and a presentation
  controller. Incoming stays on Home until accept; minimizing preserves native call/media
  state and ending removes the UI. UI remains separate from the native call contract.

- Route the video entry point to its TypeScript source for React Native so Metro can
  generate the native video component config in bundled Android builds.

- Android PiP: configuration, entry and mode listeners from `@bear-block/callx/video`;
  Expo `pictureInPicture` option. iOS entry returns false.

- Video calls (ADR-0010): contract 0.2.0 with `video`, `localVideo`, `cameraFacing` and
  `remoteVideo` on calls, `setCamera` and `switchCamera`, and `video: true` on invitations and
  `startCall`. `CallxVideoView` shows a call's video. Media adapter API 2 (`CallxVideoAdapter`)
  carries video; API 1 adapters keep working.
- Expo plugin: `video` and `cameraPermission` options.
- `setup()` takes no arguments. `appName` was validated and then never used: the call screens
  show the app's display name (`CFBundleDisplayName`, `android:label`). `CallxConfig.appName` is
  deprecated and ignored, so existing `setup({appName})` calls keep working.

## 0.1.3

- Android 10–12: calls rang only on Android 13 and later. The Telecom check looked for
  `FEATURE_TELECOM`, which exists only from API 33; earlier versions are now checked for
  `FEATURE_CONNECTION_SERVICE`, so bootstrap no longer fails there with "Telecom is unavailable".
- Android: if Telecom no longer has the app's PhoneAccount when a call arrives (for example,
  removed late after a quick reinstall), the core registers again and retries once instead of
  dropping the call. Telecom refusals are now logged under the `Callx` tag with the error type
  and code, and no caller data.

## 0.1.1

- First npm release of `@bear-block/callx`: 0.1.0 could not be published because that version
  number was used by an earlier, unpublished package with the same name. Same code as 0.1.0 of
  the Flutter package.

## 0.1.0

First public release. Highlights: typed TurboModule, Expo config plugin with no native code,
library-owned incoming path (PushKit and FCM), CallKit and Core-Telecom, durable journal and
recovery, media adapter interface. Details below; release notes:
https://bear-block.github.io/callx/project/changelog

- The native module is a typed TurboModule: Codegen spec `src/specs/NativeCallx.ts`
  (`CallxSpec`), `CallxModule` extends `NativeCallxSpec` on Android and `CallxModule.mm` forwards to
  the Swift `CallxModuleImpl` on iOS. The legacy architecture still loads `NativeModules.Callx`.
  The podspec uses `install_modules_dependencies`; `CallxModuleBridge.m` is gone.
- iOS: loading the native module no longer fails with "`new NativeEventEmitter()` requires a
  non-null argument". The package imported `react-native` as a namespace, which evaluates every
  export, including `PushNotificationIOS`; it now uses named imports only.
- `callx.getPushToken()` returns the device's push token (`voip` on iOS, `fcm` on Android) for your
  backend; `CallxBootstrap` records the PushKit token, the FCM service reports its token to
  `CallxPushTokens`.
- Expo config plugin: `bootstrap` (default true) starts `CallxBootstrap` in
  `MainApplication` and `AppDelegate`; `androidPush: "fcm"` generates `CallxMessagingService`,
  extending React Native Firebase's service when the app uses it. Expo apps need no native code.
- `CallxModule.bootstrap` (Android) and `CallxReactNativeHost.bootstrap` (iOS) start the whole native pipeline in one call through
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
