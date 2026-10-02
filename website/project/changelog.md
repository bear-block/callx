---
title: "Changelog"
description: "Release notes for all Callx packages, which share one version number."
---

# Changelog

This page is the public release history; publishing a package does not require a GitHub Release.
Development changes stay under **Unreleased** until the package version is published.

All Callx packages release together with one version number. Each package also keeps its own
`CHANGELOG.md` with package-specific details:
[callx](https://github.com/bear-block/callx/blob/main/packages/callx/CHANGELOG.md),
[@bear-block/callx](https://github.com/bear-block/callx/blob/main/packages/react-native/CHANGELOG.md),
[callx_livekit](https://github.com/bear-block/callx/blob/main/packages/callx_livekit/CHANGELOG.md),
[@bear-block/callx-livekit](https://github.com/bear-block/callx/blob/main/packages/react-native-livekit/CHANGELOG.md),
[@bear-block/callx-testkit](https://github.com/bear-block/callx/blob/main/packages/testkit/CHANGELOG.md).

## Unreleased

- **Optional call UI** ([guide](/guide/call-ui)): exported root overlay, call screen,
  branded mini-call and presentation controller for Flutter and React Native. Incoming calls
  stay on Home until accepted; Back minimizes inside the app, while leaving the app can use
  Android system PiP. Native owns call state and commands; presentation does not add contract fields.

- **Example apps:** a separate full-screen call view, camera preview at the top right, and
  call controls at the bottom. Diagnostics and simulated remote actions have their own screen.
  PiP uses remote video, then local video, then the app's configurable background and logo.
- **React Native video:** Metro consumes the typed video entry point for native component
  codegen. Fabric continues mounting UI updates while the Activity is visible in PiP.
- **LiveKit video:** remote camera mute/unmute updates video availability on Android and iOS;
  muted tracks no longer leave a frozen remote preview or prevent the app's video fallback.

- **Android picture in picture** ([guide](/guide/video#picture-in-picture-on-android)): configuration,
  explicit entry and mode notifications in Flutter and React Native. Automatic entry on Android
  12+ follows live video calls; native observers are removed on activity/runtime replacement.
  Activity layout observation also detects PiP window changes on Android 10/11.
  Expo gains `pictureInPicture`. Both examples render a compact layout; RN includes camera
  controls and keeps its web preview separate from native video. iOS PiP remains unsupported.

- **Video calls** ([guide](/guide/video), ADR-0010). Contract 0.2.0 adds `video`,
  `localVideo`, `cameraFacing` and `remoteVideo` to calls, and `setCamera` and `switchCamera`
  commands; audio calls keep the 0.1 shape and native accepts 0.1 wrappers. Invitations and
  `startCall` take `video: true` and ring as video in CallKit and Core-Telecom.
  `CallxVideoView` shows video in Flutter (platform view) and React Native (Fabric component,
  `@bear-block/callx/video`). Media adapter API 2 (`CallxVideoAdapter`) carries video;
  API 1 adapters keep working. The LiveKit adapter supports video. The Expo plugin gains
  `video` and `cameraPermission`, the testkit sends video invitations, and
  `callx-conformance --video` checks video on Android.
- **`setup()` takes no arguments.** `appName` was validated and never used; the call screens show
  your app's display name (`CFBundleDisplayName` on iOS, `android:label` on Android).
  `appName` is deprecated and ignored, so existing calls keep working.

## 0.1.3

A fix release; update if you support Android 10–12. There is no 0.1.2: npm used that number for
an earlier package with the same name.

- **Fix, Android 10–12:** incoming calls did not ring below Android 13. The core checked for
  the `FEATURE_TELECOM` system feature, which only exists from API 33, so bootstrap failed with
  "Telecom is unavailable" on earlier versions. It now checks `FEATURE_CONNECTION_SERVICE` there.
  Found by the new emulator matrix (API 29, 31, 33, 36).
- **Android:** when Telecom has lost the app's PhoneAccount (for example, removed late after a
  quick reinstall), the core registers again and retries the call once instead of dropping it.
  Telecom refusals are logged under the `Callx` tag with the error type and code only.
- **Backend guide:** send FCM invitations with a TTL equal to the time left before they expire,
  not `0s`. A zero TTL drops the invitation whenever the device's FCM connection is down at that
  moment. The testkit does the same.

## 0.1.1

A packaging release with no code changes:

- `@bear-block/callx` is on npm from this version. Its name had been used before, and npm never
  reuses a version number, so 0.1.0 could not be published.
- `callx_livekit` no longer ships local build output.
- `@bear-block/callx-testkit` declares its commands without `./` prefixes.

## 0.1.0

The first public release. Verification levels for each feature are on the
[status page](/project/status).

### Core (Flutter and React Native)

- **Shared native core**: the same Swift and Kotlin sources in both packages, contract `0.1.0`,
  checked by shared fixtures on all four languages.
- **Library-owned incoming path**: `CallKitIngress` receives VoIP pushes and reports them to
  CallKit natively, honouring iOS 26.4 `mustReport`; `TelecomIngress` takes forwarded FCM
  messages, adds the call to Core-Telecom and shows a CallStyle notification.
- **Rings only when it should**: duplicates, busy, expired and already-ended invitations never
  ring; a cancel that arrives before its invitation wins; unanswered calls end at the ring
  deadline.
- **One-call bootstrap**: `CallxBootstrap` builds the whole native pipeline, including recovery
  and media adapter discovery.
- **Durable state**: journal, replayable observation sessions, idempotent commands with
  explicit results and operation lookup; cleanup recovery after process death.
- **Push tokens**: `getPushToken()` / `pushToken()` return the VoIP or FCM token.
- **Media interface**: `CallxMediaAdapter` and `CallxMediaSink`, `mediaInterrupted`, adapters
  discovered from the Android manifest or `Info.plist`.

### Android

- Native `CallxIncomingCallActivity` that appears over the lock screen without waiting for the
  framework engine.
- Repeating ringtone on a versioned channel; volume-down silences it.
- `LockedAnswer` policy: require unlock (default) or show over the lock screen.
- Ongoing notification with a call timer; follows answers and hang-ups from every surface.
- `CallxFullScreenIntent` and `CallxTelecomAvailability` helpers.
- Audio routing through Telecom with `requestAudioEndpoint`; mute and hold from cars, headsets
  and watches.

### React Native

- Typed TurboModule (Codegen spec `NativeCallx`) on the New Architecture, with a legacy
  architecture fallback.
- Expo config plugin: `bootstrap` (no native code needed) and `androidPush: "fcm"` (generated
  messaging service, compatible with React Native Firebase).

### LiveKit adapter

- `callx_livekit` and `@bear-block/callx-livekit`: one LiveKit room per call, joined natively
  on answer from any surface.
- Telecom owns routing on Android; CallKit owns the audio session on iOS.
- Credentials from a persisted token URL (headers encrypted) or a native provider.
- Listen-only when the microphone permission is missing.

### Testkit

- `callx-console`, `callx-push` and `callx-conformance`.
