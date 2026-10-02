---
title: "Video calls"
description: "Ring as a video call, turn the camera on and off with results, and show the video with one native view, on top of the same call core."
---

# Video calls

<p class="lead">
A video call in Callx is a normal call that is also reported to the system as video. The call
rings, is answered and connects audio exactly as a voice call does; the camera and the video
views come on top, through the same native connection the media adapter already owns.
</p>

::: warning Status
Video is new in contract 0.2 and the LiveKit adapter. It has been checked on Android
emulators, not yet on physical devices. See the [status page](/project/status).
:::

## What changes and what does not

- **The call states do not change.** `active` still means audio is usable. A video call whose
  video has not arrived yet is `active`.
- **Video is part of the call.** The call carries four fields: `video` (offered or started as video),
  `localVideo` (`off`, `on`, or `blocked` when the OS took the camera), `cameraFacing` (while
  the camera is not off) and `remoteVideo` (the other side's video can be shown).
- **The camera is a command with a result**, like mute: `setCamera` and `switchCamera`.
- **Audio first, video when the app is open.** A video call answered on the lock screen or
  from the notification connects audio at once. The camera can only start once your app is in
  front, because iOS and Android do not allow the camera from the background.

## Requirements

- A media adapter that carries video. The [LiveKit adapter](/guide/livekit) does from version
  0.2. Check `capabilities.video` after `setup()`.
- The camera permission:
  - **Expo:** add `video: true` and, if you like, `cameraPermission` to Callx's plugin. It adds
    `NSCameraUsageDescription`, Android's `CAMERA` permission and an optional camera feature,
    so phones without a camera can still install the app.
  - **React Native CLI and Flutter:** add `NSCameraUsageDescription` to `Info.plist`, and
    `android.permission.CAMERA` with
    `<uses-feature android:name="android.hardware.camera" android:required="false" />` to
    `AndroidManifest.xml`.
- Ask for the camera permission yourself, when the user turns the camera on. Callx does not
  ask; without it, `setCamera(true)` is rejected with `permissionDenied`.

## Ring as a video call

Add `"video": true` to the invitation your backend sends ([backend guide](/guides/backend)):

```json
{"schemaVersion": 1, "type": "call.invited", "callId": "85a4fd88-…", "displayName": "Alex",
 "handle": "acme:user-a", "expiresAtMs": 1790000030000, "video": true}
```

The call rings with the system's video call UI: CallKit shows it as a video call, and
Core-Telecom registers it as `CALL_TYPE_VIDEO_CALL`. To start one, pass `video: true` to
`startCall`.

::: code-group

```ts [JavaScript]
await callx.startCall({callId, displayName: 'Alex', handle: 'acme:user-a', video: true});
```

```dart [Dart]
await callx.startCall(
  CallInput(callId: callId, displayName: 'Alex', handle: 'acme:user-a', video: true),
);
```

:::

## Show the video

One view shows one source. Use two for the usual layout: the other side full screen and your
own camera in a corner.

::: code-group

```tsx [React Native]
import {CallxVideoView} from '@bear-block/callx/video';

<View style={{flex: 1}}>
  {call.remoteVideo && <CallxVideoView callId={call.callId} style={{flex: 1}} />}
  {call.localVideo === 'on' && (
    <CallxVideoView callId={call.callId} source="local" mirror={call.cameraFacing === 'front'}
      style={{position: 'absolute', right: 16, bottom: 16, width: 96, height: 128}} />
  )}
</View>
```

```dart [Flutter]
Stack(children: [
  if (call.remoteVideo) Positioned.fill(child: CallxVideoView(callId: call.callId)),
  if (call.localVideo == LocalVideo.on)
    Positioned(
      right: 16, bottom: 16, width: 96, height: 128,
      child: CallxVideoView(
        callId: call.callId,
        source: VideoSource.local,
        mirror: call.cameraFacing == CameraFacing.front,
      ),
    ),
])
```

:::

The view is empty until its source exists. Two views may show the same source.

## Turn the camera on

::: code-group

```ts [JavaScript]
const result = await callx.setCamera(call.callId, true);
if (result.status !== 'applied') {
  // permissionDenied, mediaNotReady (app in the background), unsupported (no video adapter)
}
await callx.switchCamera(call.callId, 'back');
```

```dart [Dart]
final result = await callx.setCamera(call.callId, true);
await callx.switchCamera(call.callId, CameraFacing.back);
```

:::

- `setCamera(true)` is applied once the adapter publishes the camera, and the call's
  `localVideo` becomes `on`.
- `switchCamera` while the camera is off only remembers the choice for the next
  `setCamera(true)`.
- An audio call can turn the camera on too. Telling the other side is your signaling's job, as
  for every other change.

| Result | When |
|---|---|
| `applied` | The camera is on, off or switched |
| `rejected` / `permissionDenied` | No camera permission |
| `rejected` / `mediaNotReady` | The app is not in front, or media has not connected yet |
| `rejected` / `unsupported` | No video adapter is installed |
| `rejected` / `invalidState` | The call is ringing or has ended |

## Background and the lock screen

When your app goes to the background with the camera on, the OS stops the camera and the call
shows `localVideo: 'blocked'`. The call itself continues with audio. When the app comes back,
the adapter resumes the camera and `localVideo` returns to `on`. Turning the camera off from
`blocked` is a normal `setCamera(false)`.

## Platform notes

- **iOS:** CallKit's `hasVideo` follows the camera, so the system UI matches. Callx enables
  `supportsVideo` on its CallKit provider when the adapter carries video.
- **Android:** Core-Telecom 1.0 cannot change a call's type after it started, so a call stays
  the type it was offered or started as. In Flutter, video views use Texture Layer Hybrid
  Composition, which needs adapters to render with a `TextureView`.
- **Preview:** the [simulator](/guide/simulator) supports video: `simulator.remoteVideo(true)`
  and `simulator.cameraBlocked(true)`.

## Writing a video adapter

A video adapter implements `CallxVideoAdapter` (adapter API 2): `setCamera`, plus `attach` and
`detach` to render into the surfaces the views give it. See
[write a media adapter](/guides/write-an-adapter#video).
