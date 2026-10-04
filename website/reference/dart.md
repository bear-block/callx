---
title: "Dart API"
description: "The complete Dart API of the callx and callx_livekit packages."
---

# Dart API

::: info Released reference
This page describes version 0.2.3 with contract 0.2.0, native video and Android PiP.
See [status](/project/status) for verification limits and [changelog](/project/changelog).
:::


```dart
import 'package:callx/callx.dart';
```

The generated API documentation is on [pub.dev](https://pub.dev/documentation/callx/latest/).
This page summarizes it.

## `Callx`

```dart
final callx = Callx();
```

Create one instance for the app's lifetime. The constructor takes an optional `CallxBackend` for
tests; by default it uses the native plugin.

### Setup and state

| Member | Type | Description |
|---|---|---|
| `setup([CallxConfig config])` | `Future<CallxCapabilities>` | Connects to the native core and returns what the runtime supports; takes no required arguments |
| `getSnapshot()` | `Future<CallSnapshot>` | The current call, once |
| `snapshots` | `Stream<CallSnapshot>` | The current call now and on every change |
| `pushToken()` | `Future<PushToken?>` | `PushToken(type: 'voip' \| 'fcm', token: …)` |
| `dispose()` | `Future<void>` | Releases this instance. Does not hang up |

`setup()` takes no arguments. The incoming and ongoing call screens show your app's display name: `CFBundleDisplayName` on iOS (change the CallKit icon and ringtone through `providerConfiguration`, see [iOS](/platforms/ios#provider-configuration)) and `android:label` on Android. `CallxConfig.appName` is deprecated and ignored; passing it still compiles.

### Commands

Each takes an optional named `options: CommandOptions` and returns `Future<CommandResult>`.

| Method | Description |
|---|---|
| `startCall(CallInput input, {CommandOptions? options})` | Starts an outgoing call |
| `answer(String callId, {CommandOptions? options})` | Answers; the call becomes `connecting` |
| `end(String callId, {CommandOptions? options})` | Declines, cancels or hangs up |
| `setMuted(String callId, bool muted, {CommandOptions? options})` | Mutes or unmutes |
| `setHeld(String callId, bool held, {CommandOptions? options})` | Holds or resumes |
| `setCamera(String callId, bool on, {CommandOptions? options})` | Turns the local camera on or off; needs a video adapter and the app in front. See [video calls](/guide/video) |
| `switchCamera(String callId, CameraFacing facing, {CommandOptions? options})` | Chooses the front or back camera; remembered while the camera is off |
| `queryOperation(String operationId, String accountGeneration)` | `Future<OperationLookup>` |

### Observation sessions

| Method | Type |
|---|---|
| `openSession([String? afterSequence])` | `Future<ObservationSession>` |
| `eventsFor(String sessionId)` | `Stream<CallEvent>` |
| `acknowledge(String sessionId, String throughSequence)` | `Future<void>` |
| `closeSession(String sessionId)` | `Future<void>` |

## Types

| Type | Fields |
|---|---|
| `CallxConfig` | `appName?` (deprecated, ignored) |
| `CallInput` | `callId`, `displayName`, `handle`, `video` (default false) |
| `CommandOptions` | `operationId?`, `deadlineAtMs?` |
| `CallxCapabilities` | `coreVersion`, `execution`, `accountGeneration`, `nativeCalling`, `durableReplay`, `providerManagedSignaling`, `hold`, `mute`, `video` |
| `CallSnapshot` | `sequence`, `call?` |
| `Call` | `callId`, `displayName`, `direction`, `state`, `muted`, `mediaReady`, `mediaInterrupted`, `video`, `localVideo` (`LocalVideo.off`, `on`, `blocked`), `cameraFacing?`, `remoteVideo`, `endReason?`, `createdAtMs?`, `acceptedAtMs?`, `mediaConnectedAtMs?`, `endedAtMs?` |
| `CommandResult` | `operationId`, `status`, `execution`, `completedAtMs`, `error?` |
| `OperationError` | `code`, `message`, `retryable`, `platform?` |
| `PlatformError` | `domain`, `code` |

## `CallxVideoView`

```dart
CallxVideoView(callId: call.callId, source: VideoSource.remote, fit: VideoFit.cover)
```

| Parameter | Type | Default | Description |
|---|---|---|---|
| `callId` | `String` | required | The call whose video to show |
| `source` | `VideoSource` | `VideoSource.remote` | This device's camera (`local`) or the other side's video |
| `fit` | `VideoFit` | `VideoFit.cover` | Crop to fill the view, or letterbox inside it |
| `mirror` | `bool` | `false` | Flip horizontally, usually for the front camera preview |

A platform view: Texture Layer Hybrid Composition on Android, `UiKitView` on iOS. Changing a
parameter recreates the native view. It stays empty until the source exists, and renders
nothing on other platforms. See [video calls](/guide/video).
| `OperationLookup` | `operationId`, `accountGeneration`, `status`, `result?` |
| `ObservationSession` | `sessionId`, `accountGeneration`, `status`, `snapshot`, `replay` |
| `ObservationSnapshot` | `watermark`, `calls` |
| `CallEvent` | `eventId`, `sequence`, `kind`, `source`, `observedAtMs`, `callId?`, `operationId?` |
| `PushToken` | `type`, `token` |

## Enums

| Enum | Values |
|---|---|
| `CallState` | `incoming`, `outgoing`, `connecting`, `active`, `held`, `ended` |
| `CallDirection` | `incoming`, `outgoing` |
| `EndReason` | `localHangup`, `declined`, `remoteEnded`, `callerCancelled`, `unanswered`, `busy`, `failed`, `answeredElsewhere`, `declinedElsewhere` |
| `CommandStatus` | `applied`, `rejected`, `timedOut`, `unknown` |
| `OperationLookupStatus` | `available`, `unavailable`, `generationMismatch` |
| `SessionOpenStatus` | `fresh`, `resumed`, `resynced` |
| `CallEventKind` | `callChanged`, `operationCompleted`, `resyncRequired` |
| `CallEventSource` | `local`, `platform`, `signaling`, `media`, `recovery` |
| `CallxErrorCode` | See [errors](/reference/errors) |
| `ExecutionMode` | `native`, `preview` |

## `CallxException`

```dart
class CallxException implements Exception { final String code; final String message; }
```

Thrown for validation and transport errors. Results with `rejected`, `timedOut` or `unknown`
status are returned, not thrown.

## Simulator

```dart
import 'package:callx/callx_preview.dart';
final preview = CallxPreview();
// preview.callx, preview.simulator
```

`simulator` offers `incoming(CallInput)`, `remoteAnswered()`, `mediaConnected()`,
`remoteEnded()` and `reset()`.

## `CallxPictureInPicture`

| Member | Behaviour |
|---|---|
| `configure({required bool automatic})` | Configures auto-entry on Android 12+ during a live answered video call |
| `enter(): Future<bool>` | Requests entry; false when unsupported |
| `changes: Stream<bool>` | Reports PiP mode changes on Android |

From 0.2.4 the same APIs work on iOS 15+ ([experimental](/guide/video#picture-in-picture-on-ios)).
On other platforms configuration has no effect, entry returns false and `changes` emits nothing.
The app supplies its compact layout and branded fallback. See [PiP layout](/guide/video#picture-in-picture-on-android).

## `callx_livekit`

```dart
import 'package:callx_livekit/callx_livekit.dart';

await CallxLiveKit.configure(LiveKitConfig(tokenUrl: url, headers: {...}));
await CallxLiveKit.reset();
```

## Optional call UI

Import `package:callx/callx_ui.dart` in Flutter or `@bear-block/callx/ui` in React Native.
UI observes snapshots and invokes host callbacks; it never creates another native call owner.

| Export / option | Purpose / default |
|---|---|
| CallxCallOverlay, CallxMiniCall, CallxPresentationController | Root presentation and in-app minimize/expand |
| CallxCallScreen | Supplied voice/video layout with host controls and media rendering |
| CallxCallControl | Selected/disabled/destructive presentation; default size 58dp, host callback |
| autoHideControls | true; connected video hides after idle timeout |
| compactVideoControls | true; compact video row |
| controlsPinned | false; pin while showing host dialogs or commands |
| controlsTimeout | Five seconds; foreground return starts a fresh timeout |
| leadingControls / endControl | Host top-left and End slots |
| header / statusLabel / previewAlignment | Host header/status and preview placement |
| CallxCallBrand | Background/accent/foreground/surface/danger colors and logo |

Flutter uses SafeArea. Preview sizing uses previewSize; customize text with minimizeLabel,
doneLabel, cameraPausedLabel and localPreviewLabel. Hosts can replace videoBuilder, controls and endControl.

See [Call UI](/guide/call-ui) for composition and platform distinctions, and
[upgrade 0.2.3](/guide/upgrade-0-2-3) for behavior changes from 0.2.2.
