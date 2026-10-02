---
title: "Two-device call demo"
description: "Steven calls hao.dev7: React Native and Flutter Android emulators, real FCM and native LiveKit."
---

# Two-device call demo

Steven uses the React Native example. hao.dev7 uses the Flutter example.
Both examples use the same Kotlin call core and native LiveKit adapter.

<CallDemoShowcase />

## What you are watching

| Part | Recording setup |
|---|---|
| Steven, on the left | React Native example, Android 16 / API 36 emulator |
| hao.dev7, on the right | Flutter example, Android 13 / API 33 emulator |
| Incoming invitation | Real FCM delivery to the Android native host |
| Accept and end signaling | The local demo harness relays example-only test signals through FCM |
| Audio/video | Two distinct LiveKit participants in the same local room; native media on both devices |
| Camera images | The Android emulators' cameras |
| Call UI | Optional Callx framework overlay, in-app mini-call and Android system PiP |

The harness supplies signaling and development credentials. A production app needs its own
authenticated backend and media-token endpoint. UI components observe native snapshots;
minimizing and expanding the overlay do not create or answer another call.

## Recording transcript

1. Steven places an outgoing video call to hao.dev7. The receiving emulator is on Android Home.
2. The native incoming call surface shows **Steven**. hao.dev7 accepts it.
3. Both hosts join the same LiveKit room. Camera publishing is enabled explicitly on both devices.
4. Steven mutes/unmutes and holds/resumes. hao.dev7 switches the local camera.
5. hao.dev7 minimizes the overlay, sees the app's Home screen and returns to the call.
6. Steven enters Android system PiP and returns to the app.
7. Both cameras are disabled. PiP shows the example's brand background and logo.
8. hao.dev7 ends the call. The harness relays the end signal to Steven and the call overlay closes.

The MP4 presents the continuous call timeline side by side with device labels. It uses actual
emulator `screencap` frames, sampled up to twice per second with elapsed timestamps. Frames
are held between captures; actions keep their original order and speed. Its captions name
the actions. The short GIF previews the video portion, rather than every step.
Screen recordings have no audio track. The harness checks native media connection and
remote-video events; this does not demonstrate audible speech or acoustic quality.

## Reproduce locally

Build and install both [example apps](/guide/simulator#run-the-example-apps), grant camera/microphone
permissions, configure Firebase for their native hosts, and start the [local LiveKit server](/guide/livekit).
Install the UI probe from `tool/android-ui` as described in the [device-testing guide](/guides/testing).
Stop `call:console` before running the demo: this harness uses its port, `8787`.

```sh
CALLX_DEMO_SERVICE_ACCOUNT=/absolute/path/to/firebase-service-account.json \
  node tool/demo-two-device.mts \
  --caller emulator-5558 --callee emulator-5556 \
  --output /tmp/callx-demo-new-take
```

Keep the service account outside version control. The harness does not print device tokens
or media credentials. It saves the original screen captures, their timestamps and `result.json` locally.
Check that the result passes and inspect the captures before sharing them. Restart the
ordinary console with `npm run call:console` after the harness exits.

To compose a passing take, use an FFmpeg binary with H.264 and `drawtext` support:

```sh
node tool/render-call-demo.mts \
  --input /tmp/callx-demo-new-take \
  --output /tmp/callx-demo-assets \
  --ffmpeg /absolute/path/to/ffmpeg \
  --font /absolute/path/to/font.ttf
```

The renderer produces the continuous MP4, poster, short GIF, action captions and chapter
times. It keeps the recorded order and speed. Still frames at the end are extended briefly
so both screens remain visible through the last chapter.

## Verification boundary

This is an Android emulator demonstration. It does not establish physical-device acceptance,
iOS behavior, secure lock-screen video behavior, network reconnection or crash recovery.
See [status](/project/status) and [testing](/guides/testing) for the remaining platform gates.
iOS system PiP is not implemented. System PiP on Android uses the host activity;
the in-app mini-call is a separate framework component.
