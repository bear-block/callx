---
title: "Incoming calls on the lock screen"
description: "Native incoming voice/video, secure PIN answering and camera pause/resume on an Android emulator."
---

# Incoming calls on the lock screen

This demo focuses on the Callx native core: presenting an invitation, handling Answer and
Decline, and starting the native media adapter while the device is still locked.
It uses the React Native example on Android 16 / API 36 with a **secure PIN** and the
default **RequireUnlock** policy. The caller is a local browser test participant named Steven.


<CallDemoShowcase demo="lockscreen" />

## Recording transcript

1. The receiving emulator leaves the app and locks with a temporary PIN.
2. Steven sends a voice invitation through real FCM. The native incoming screen appears.
3. Decline ends the invitation without entering the PIN.
4. A second voice invitation is accepted while locked. The native LiveKit connection starts;
   the harness verifies that the secure keyguard is still showing.
5. The native call screen stays visible, with a running timer. Mute/unmute and hold/resume
   operate while locked. The audio chooser lists the real Telecom endpoints; this emulator
   exposes Speaker only, so this trial does not prove switching to an earpiece or Bluetooth.
6. The caller remotely ends that voice call.
7. A video invitation arrives. Answer keeps the native screen and timer visible; audio connects
   while locked and the camera does not start.
8. Open app requests the PIN. After entering it, the app displays the accepted call with visible controls and a fresh five-second timeout. The user explicitly enables
   the camera, and the caller receives its video.
9. Locking during that video call pauses the camera. Unlocking and foregrounding the app
   resumes it. Ending the call closes the overlay.

The PIN and original lock-screen settings are restored after the trial. Test assertions use
native logs, the actual keyguard state and remote video subscription, not UI labels alone.

## Verification scope

Call state, incoming presentation and media acceptance stay native-owned; rendering an
accepted-call screen does not answer again or create another media room. A video invitation
is not permission to activate a locked device's camera. See [incoming calls](/concepts/incoming)
and [video](/guide/video) for the corresponding API behavior.

This is a warm-process Android emulator trial. It does **not** prove cold-start/killed-app
delivery, iOS behavior, physical-device acceptance, audible speech, every Android OEM,
or the alternative ShowOverLockScreen policy. The recording is silent. The caller uses
the local test backend and stock video, not a production signaling service.

The recording combines continuous emulator video with timestamped full-display screenshots
during keyguard intervals: the emulator recorder omits some incoming/keyguard surfaces.
Those screenshots are held between captures, so locked intervals have a lower frame rate.
The accepted video call uses continuous recording. Actions retain their real order and
elapsed timing. The phone frame and chapter labels are presentation additions.

Stock camera footage and license attribution are listed in the
[two-device demo credits](/guide/demos#camera-footage-credits). Names are fictional;
the people shown do not endorse Callx.

## Reproduce locally

Use the existing API 36 RN example, real Firebase configuration, the standalone UI probe,
and the [local call console and LiveKit server](/guides/testing). The script accepts only
emulator serials and refuses to replace an existing secure credential. It temporarily sets
the demo PIN `2468` and restores the original settings in cleanup.

```sh
node tool/demo-lockscreen.mts \
  --device emulator-5558 --output /tmp/callx-lockscreen-take

node tool/render-lockscreen-demo.mts \
  --input /tmp/callx-lockscreen-take --output /tmp/callx-lockscreen-assets \
  --ffmpeg /absolute/path/to/ffmpeg
```

The browser caller normally uses a synthetic camera. For stock footage, prepare a Y4M file
and set `CHROME` to a launcher that invokes Chrome with
`--use-file-for-fake-video-capture=/absolute/path/to/clip.y4m` while forwarding its arguments.
Use only footage you may redistribute. The receiver's file camera setup is described in
the [two-device recording guide](/guide/demos#reproduce-locally).

Inspect both `result.json` and the exported footage before sharing. The checks do not replace
the [remaining device acceptance gates](/project/status).
