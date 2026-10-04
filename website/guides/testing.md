---
title: "Test on devices"
description: "Test pushes, a local call console that plays the caller, adapter conformance, and a device acceptance checklist."
---

# Test on devices

Calls are only as good as their behaviour on real phones. `@bear-block/callx-testkit` gives you
the other end of the call on your laptop, so one phone is enough for most tests.

```sh
npm install --save-dev @bear-block/callx-testkit
```

| Command | What it does |
|---|---|
| `callx-console` | A local call server with a web page: sends invitations, plays the caller with real audio from your browser, answers and ends calls as the remote side, and follows each call |
| `callx-push` | Sends one FCM or APNs VoIP test push |
| `callx-conformance android` | Runs the media adapter conformance scenario and fails on any deviation |

::: warning Development only
The console has no authentication. It listens on `127.0.0.1` unless you pass `--host`.
:::

## Send a test push

```sh
# Android
npx callx-push android --service-account firebase-adminsdk.json --token <FCM token>
npx callx-push android ... --message end --call-id <id> --reason callerCancelled

# iOS
npx callx-push ios --key AuthKey_ABC123.p8 --key-id ABC123 --team-id TEAM123 \
  --bundle-id com.example.calls --token <VoIP token> [--production]
```

Options: `--call-id`, `--name`, `--handle`, `--expires-in <seconds>` (default 30) and `--dry-run`
to print the request without sending it.

## The call console

```sh
npx callx-console --service-account firebase-adminsdk.json
```

Open `http://127.0.0.1:8787`. For real audio, run a LiveKit development server alongside:

```sh
docker run --rm -p 7880:7880 -p 7881:7881 -p 7882:7882/udp \
  livekit/livekit-server --dev --bind 0.0.0.0 --node-ip 127.0.0.1
```

The console issues LiveKit tokens with the adapter's token contract (`POST /api/media-token`,
`{"callId"}` in, `{"url","token"}` out), so point the adapter's `tokenUrl` at it in debug builds.
It keeps `adb reverse` set for connected Android devices. With `--host 0.0.0.0`, an iPhone on the
same network reaches it at your computer's address.

## Conformance

```sh
npx callx-conformance android [--device <serial>] [--console http://127.0.0.1:8787]
```

With the console and LiveKit running and the app installed with microphone permission:

1. The console invites the device through FCM; a headless browser joins as the caller.
2. The device rings; the test answers from the notification shade.
3. Media connects.
4. The caller leaves: the device reports interrupted media and the call stays active.
5. The caller returns: media reconnects.
6. The remote side ends the call.
7. Logcat shows no crash.

With matching development packages, add `--video` to run video conformance on Android:

```sh
npx callx-conformance android --video --device <serial>
# From this repository, run the Flutter example across AVDs:
npm run conformance:matrix -- --video callx_api33 callx_api36
```

The video steps check camera publishing, remote video, visible frames, camera switching and
background/foreground recovery. PiP is a separate UI trial; `--video` does not test PiP.

For PiP, test explicit entry, automatic entry on Home (Android 12+), compact video or branded
fallback, camera continuity, fullscreen return, closing PiP and disabling auto-entry after end.
Run those trials in both framework apps. See [recorded results](/project/status).

From the development repository, the shared Flutter/RN example UI trial is:

```sh
node tool/pip-smoke.mjs --device <serial> --output /tmp/callx-pip-trial \
  --dismiss true --fallback true
```

It requires an installed example with camera, microphone and notification permissions, the
local console and LiveKit server. It restarts the example, uses fresh accessibility windows,
and records OS window state, video frame changes, screenshots and results. Setup details are
in [`tool/android-ui/README.md`](https://github.com/bear-block/callx/blob/main/tool/android-ui/README.md).

iOS conformance needs an iPhone, because the Simulator ends CallKit calls immediately.

## Acceptance checklist

Run these on each platform you ship, on release builds, with the screen on, locked and off:

- [ ] Incoming call with the app in use, in the background, swiped away, and after a reboot and
      unlock.
- [ ] Answer from the system UI, the notification, your app, and (if you support them) a watch
      or a car. Two-way audio each time.
- [ ] Decline, and caller cancel before answer. The caller's side updates; nothing rings later.
- [ ] A duplicate push and a late push for an ended call. Neither rings.
- [ ] Mute and hold from your UI and from the system UI. Audio follows.
- [ ] Speaker, earpiece and Bluetooth routing from your UI (`setAudioRoute`), and `audioRoutes`
      updating when a headset connects or disconnects.
- [ ] Keypad tones (`sendDtmf` and, on iOS, the CallKit keypad) reach the remote side or IVR.
- [ ] `setDisplayName` updates the system call UI.
- [ ] Android: an unanswered or cancelled call leaves a missed-call notification; Call back opens
      the app with a call request. iOS: tapping the call in Recents delivers a call request.
- [ ] Network loss during a call: `mediaInterrupted`, then recovery.
- [ ] Engine reload and process death during a call. State reconciles; nothing repeats.
- [ ] Sign out and in as another user. Old calls and operations stay with the old account.
- [ ] Microphone and notification permissions denied.

### Android vendors

Test at least one device from each family your users have: Google Pixel, Samsung, Xiaomi, and
one of Oppo, Vivo or OnePlus. Vendor battery managers are the most common cause of missed calls;
see [Android](/platforms/android#vendor-battery-managers).

Record device, OS version, app build and outcome for each run. A simulator run never counts as a
device pass.
