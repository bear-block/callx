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
Video and Android PiP are available in the development source and are unreleased. Published
0.1.3 packages ship contract 0.1.0 and do not include these APIs. Flutter Android video has
passed emulator conformance; Flutter and RN PiP have Android 16 UI trials covering video,
camera continuity and branded fallback. Physical devices and iOS video remain
unverified. See the [status page](/project/status).
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

- A media adapter that carries video. The development [LiveKit adapter](/guide/livekit)
  implements media adapter API 2. Use matching development core and adapter packages;
  check `capabilities.video` after `setup()`.
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
 "handle": "callx:user-a", "expiresAtMs": 1790000030000, "video": true}
```

The call rings with the system's video call UI: CallKit shows it as a video call, and
Core-Telecom registers it as `CALL_TYPE_VIDEO_CALL`. To start one, pass `video: true` to
`startCall`.

::: code-group

```ts [TypeScript]
await callx.startCall({callId, displayName: 'Alex', handle: 'callx:user-a', video: true});
```

```dart [Dart]
await callx.startCall(
  CallInput(callId: callId, displayName: 'Alex', handle: 'callx:user-a', video: true),
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

```ts [TypeScript]
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

::: warning Verification gap
Video-call acceptance from the lock screen has not yet been verified. The current Android
UI evidence covers answering while unlocked, live video and PiP. Earlier audio lock-screen
tests do not establish video-call behavior. Treat the lifecycle behavior below as the
intended behavior until the video lock-screen matrix passes.
:::

When your app goes to the background with the camera on, the OS stops the camera and the call
shows `localVideo: 'blocked'`. The call itself continues with audio. When the app comes back,
the adapter resumes the camera and `localVideo` returns to `on`. Turning the camera off from
`blocked` is a normal `setCamera(false)`.

## Picture in picture on Android

Enable PiP on the host activity with `android:supportsPictureInPicture="true"` and
`android:configChanges="screenSize|smallestScreenSize|screenLayout|orientation"`, preserving
any existing configuration flags. With Expo, use `pictureInPicture: true` in the Callx plugin.

::: code-group

```ts [React Native]
import {configurePictureInPicture, enterPictureInPicture,
  addPictureInPictureListener} from '@bear-block/callx/video';

configurePictureInPicture({automatic: true});
const stop = addPictureInPictureListener(inPiP => {
  // Render only the remote video (or your local preview) while inPiP is true.
});
await enterPictureInPicture(); // false if the activity or device cannot enter PiP
// On screen cleanup: stop(); configurePictureInPicture({automatic: false});
```

```dart [Flutter]
await CallxPictureInPicture.configure(automatic: true);
final subscription = CallxPictureInPicture.changes.listen((inPiP) {
  // Render only the remote video (or your local preview) while inPiP is true.
});
await CallxPictureInPicture.enter();
// On screen cleanup: subscription.cancel();
// CallxPictureInPicture.configure(automatic: false);
```

:::

The whole activity shrinks into the PiP window. Keep its layout compact even if the call ends
while the window is open. Automatic entry is available on Android 12 and later, and only
while an answered video call is live. On Android 10 and 11, use the explicit entry button.
The camera continues while the activity is visible in PiP; when the activity stops, the
adapter blocks it as described above. PiP is separate from the call contract.

### A branded fallback

The examples prefer remote video, then the local camera. When neither source is available,
render your app's background colour and logo. This also works for a connected call before the
other side publishes video, or after the call ends while PiP is still open.

Android PiP displays your activity, so branding belongs to your Flutter/RN layout. No extra
native PiP configuration is needed. Use your app's theme and image asset, or expose
`backgroundColor` and `logo` props if you build a reusable call-screen component.

Both examples use an app-owned `CallBrand` in their separate call-screen component. The
remote video fills the call screen, the local preview sits at the top right, and diagnostics
have their own screen. Use those components as a starting point and replace the colors/logo
with your own app's branding.

::: code-group

```tsx [React Native]
// appLogo is your image source; brandColor comes from your theme.
<View style={{flex: 1, backgroundColor: brandColor,
  alignItems: 'center', justifyContent: 'center'}}>
  <Image source={appLogo} resizeMode="contain" style={{width: 64, height: 64}} />
</View>
```

```dart [Flutter]
// appLogo is your logo widget or image asset.
ColoredBox(
  color: Theme.of(context).colorScheme.primary,
  child: SizedBox.expand(child: Center(child: appLogo)),
)
```

:::

On iOS, configuration does nothing, entry returns `false`, and the listener emits no events.
iOS PiP is not implemented yet. Device verification follows the [Android PiP guide](https://developer.android.com/develop/ui/views/picture-in-picture).

## Platform notes

- **iOS:** CallKit's `hasVideo` follows the camera, so the system UI matches. Callx enables
  `supportsVideo` on its CallKit provider when the adapter carries video.
- **Android:** from Android 14 (API 34), Telecom registers the call as a video call. Below
  that, Core-Telecom adds calls through a `ConnectionService`, which Telecom records as audio;
  the video itself is unaffected, only what Telecom reports to the system (for example to a
  car). Core-Telecom 1.0 also cannot change a call's type after it started, so a call stays the
  type it was offered or started as. In Flutter, video views use Texture Layer Hybrid
  Composition, which needs adapters to render with a `TextureView`.
- **Preview:** the [simulator](/guide/simulator) supports video: `simulator.remoteVideo(true)`
  and `simulator.cameraBlocked(true)`.

## Writing a video adapter

A video adapter implements `CallxVideoAdapter` (adapter API 2): `setCamera`, plus `attach` and
`detach` to render into the surfaces the views give it. See
[write a media adapter](/guides/write-an-adapter#video).
