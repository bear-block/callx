---
title: "Changelog"
description: "Release notes for all Callx packages, which share one version number."
---

# Changelog

This page is the public release history; publishing a package does not require a GitHub Release.
Development changes stay under **Unreleased**, or are explicitly marked publication pending.
Every release records features, fixes, breaking changes (including none), migration steps and
verification limits. Breaking API changes and visible behavior changes are described separately.

All Callx packages release together with one version number. Each package also keeps its own
`CHANGELOG.md` with package-specific details:
[callx](https://github.com/bear-block/callx/blob/main/packages/callx/CHANGELOG.md),
[@bear-block/callx](https://github.com/bear-block/callx/blob/main/packages/react-native/CHANGELOG.md),
[callx_livekit](https://github.com/bear-block/callx/blob/main/packages/callx_livekit/CHANGELOG.md),
[@bear-block/callx-livekit](https://github.com/bear-block/callx/blob/main/packages/react-native-livekit/CHANGELOG.md),
[@bear-block/callx-testkit](https://github.com/bear-block/callx/blob/main/packages/testkit/CHANGELOG.md).

## Unreleased (3.0.1) {#unreleased}

Not published yet.

- **Backend events from app code** ([ADR-0014](/project/decisions)): Dart
  `CallxSignaling.remoteAnswered` / `remoteEnded` and TypeScript `reportRemoteAnswered` /
  `reportRemoteEnded` hand `call.accepted` and `call.ended` to the native ingress. Apps whose
  signaling client runs in Dart or JavaScript, including Expo managed apps, can now complete an
  outgoing call without native code.
- **Android push signals**: `handlePush` accepts `call.ended` and `call.accepted` under the
  `callx` key. Sent as normal-priority FCM messages, they stop a ringing call even when the app
  was killed. Older cores ignore them without ringing.
- Native `remoteEnded` / `remoteAnswered` return whether the call changed; existing callers
  compile unchanged.

**Fixes in 3.0.0:**

- The Android missed-call **Call back** button did nothing: the Flutter and React Native package
  manifests lacked `CallxCallBackActivity`, because the native source sync copied the core's
  Kotlin files but not its manifest. Both are now synced and checked.
- An earlier missed-call notification reappeared every time the app process started cold.

Verified on an Android 16 (API 36) emulator with real FCM and the app killed: the cancel push
stops ringing in about a second, one missed-call notification appears, and Call back opens the
app.

## 3.0.0 — 2026-10-04 {#release-3-0-0}

**Published on npm and pub.dev.** Package version 3.0.0; contract 0.3.0. The version follows
0.2.4 directly: npm never reuses a version number, and 0.3.x, 0.4.x, 1.x and 2.x were already
taken by earlier uploads of the `@bear-block/callx` name, so all packages moved to 3.0.0 together.

### Features

- **Audio routes**: `call.audioRoutes` and `call.audioRoute` from Core-Telecom endpoints and the
  CallKit audio session; switch with `setAudioRoute`.
- **Keypad tones**: `sendDtmf` and the CallKit keypad, through an optional adapter interface;
  the LiveKit adapters publish SIP DTMF. Reported as the `dtmf` capability.
- **Caller-name updates**: `setDisplayName` updates CallKit and the Android notification.
- **Call requests**: call back from iOS Recents, contact cards and Siri, and from the new Android
  missed-call notification, through `Callx.callRequests` / `addCallRequestListener`.
- iOS donates answered calls to Siri suggestions (`donateCalls`) and reports outgoing calls as
  connecting to CallKit.

### Fixes

None beyond 0.2.4.

### Breaking changes and migration

Contract 0.3.0 adds three commands, optional call route fields and the `dtmf` capability. Custom
TypeScript backends must supply `dtmf`. Exhaustive command switches in custom backends/native
executors must handle `setAudioRoute`, `sendDtmf` and `setDisplayName`. Native still accepts older envelopes, but new wrappers
need the new native core: upgrade core/provider together and rebuild the app. Existing PiP and
lifecycle APIs keep their signatures. See [phone features and migration](/guide/phone-features).

### Verification limits

Automated checks cover command behavior and platform mappings. Physical headset/Bluetooth,
Recents/Siri launch and SIP/IVR acceptance remain pending.

## Website documentation update — 2026-10-04 (0.2.3)

Compare described 0.2.3 at the time, distinguishes system video reporting from media/UI/PiP, and
links the officially reviewed alternatives. Homepage, package/API reference and video setup
use the current version; UI options and upgrade guidance are synchronized with source.
Historical release/test dates remain intact. No additional npm/pub release accompanies this
website update.

## 0.2.4 — 2026-10-04 {#release-0-2-4}

### Features

- iOS 15+ native video-call PiP (experimental), shared by Flutter and React Native: automatic/manual
  entry, remote/local/branding selection, restore handling and cleanup without a framework session.
- Native fallback customization with app color/logo/text; LiveKit PiP uses a sample-buffer surface.
- Conditional background camera publication while PiP is starting/active and multitasking capture
  is supported; ordinary backgrounding still pauses the camera.

### Breaking changes

No contract or existing method signature changes. The Swift video surface gains an optional
`purpose` property; custom video adapters should use a background-safe renderer for PiP surfaces.

### Migration

Update all packages to 0.2.4. iOS PiP uses the existing PiP APIs: keep an inline native video
view mounted, enable the audio background mode and check the host's camera capabilities.
See [iOS PiP setup](/guide/video#picture-in-picture-on-ios).

### Verification

Native lifecycle and bridge tests, Simulator builds and renderer integration checks are local
verification only. Physical iPhone media, camera continuity and restore acceptance remain pending.

## 0.2.3 — 2026-10-04 {#release-0-2-3}

**Published on npm and pub.dev.** Package version 0.2.3; contract remains 0.2.0.

### Features

- Reusable Flutter/React Native call controls, custom header/status/end slots, leading controls,
  localized labels, preview placement and additional brand colors.
- Compact video controls: equal 58dp buttons including End, a top local preview, direct Hold,
  and a transparent camera-switch icon. Connected video controls hide after five idle seconds;
  foreground return restores them with a fresh timeout. Screen readers and reduced motion are respected.
- Android native locked-call screen retains timer, mute/hold and Telecom audio controls after
  Answer. Open app requests unlocking; camera activation remains an explicit action after unlock.
- Refreshed two-device and secure-lock demos, feature gallery and copyable Dart/TypeScript setup generator.

### Fixes

- Android API33 journal pruning uses an API available on older runtimes.
- Safe areas, control alignment and portrait/landscape access to End in the example apps.
- Hidden controls cannot receive a destructive action on the first reveal gesture.
- Steven and hao.dev7 examples identify their owner and show the correct peer contact.

### Breaking changes

No removed or renamed public API and no call-contract or media-adapter version change.
**UI behavior changes:** the supplied connected-video screen now hides controls by default;
its layout and local-preview placement change. Native Android Answer with RequireUnlock keeps
an ongoing-call screen visible. Hosts using custom controls should review the upgrade guide.

### Migration

See [upgrade from 0.2.2 to 0.2.3](/guide/upgrade-0-2-3) for dependency updates, persistent controls,
safe-area configuration, customization and the unchanged native ownership rules.

### Verification and limitations

Two-device Android trial: 25 checks; secure-PIN Android trial: 46 checks. Native iOS Simulator:
92 tests, with both example Home screens running. Physical-device and iPhone call acceptance
remain pending; iOS system PiP is not implemented. See [status](/project/status).

## 0.2.2 — 2026-10-02

Package version 0.2.2 uses contract 0.2.0. Versions 0.2.0 and 0.2.1 are skipped because
those numbers were previously used on npm and cannot be reused.

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

### Breaking changes and migration

The 0.2.2 call contract adds optional video fields and commands; media adapter API2 retains API1
compatibility. Existing setup appName is deprecated and ignored. Update core and adapters
together; see [video integration](/guide/video) and [migration rollout](/guides/migration-rollout).

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
