---
title: "Your first real call"
description: "A checkpoint-based journey from native setup to a ringing call, real media and production verification."
---

# Your first real call

Start with [your personalized checklist](/guide/setup). This page explains how to tell whether
each part works. A ringing notification, an active media connection and a rendered call screen
are different checkpoints; verify them separately.

## 1. Prepare the devices and credentials

Install a native build from the [Flutter](/guide/flutter), [React Native](/guide/react-native)
or [Expo](/guide/expo) guide. A package install or JavaScript reload alone is insufficient.
Use two installations for a conversation. Android emulators with Google services can receive
FCM; iOS VoIP push testing requires a physical iPhone. Start with a foreground, unlocked app.

Configure Firebase for Android or signing/APNs VoIP for iOS. Keep server push credentials on
the backend. Request microphone permissions, notification permissions where applicable, and
camera permission when enabling video. Read the [Android](/platforms/android) and
[iOS](/platforms/ios) setup pages for platform-specific requirements.

**Check:** native bootstrap completes, framework setup succeeds and the device has Internet
access. Working localhost forwarding does not establish Internet or FCM connectivity.

## 2. Register the installation's push token

After setup, retrieve the platform token and register it with your backend against the signed-in
account and installation. Token changes must update that registration. The following fragments
assume an initialized `callx` and an authenticated `registerInstallation` function that you implement.

::: code-group

```ts [React Native / Expo]
const token = await callx.getPushToken();
if (token) await registerInstallation(token);
```

```dart [Flutter]
final token = await callx.pushToken();
if (token != null) await registerInstallation(token);
```

:::

**Check:** the backend has the token for the intended installation and its platform. Do not
publish tokens in logs, screenshots or support tickets. A missing token usually means native
push configuration or registration has not completed; check the native host diagnostics.

## 3. Make it ring before adding call navigation

Have your backend create a unique call ID and send the [invitation payload](/backend/reference).
For a local trial, use the [test console](/guides/testing), with your own push credentials.
Begin with an incoming call so native ingress can be verified independently of outbound signaling.

**Check:** the native incoming surface shows the intended caller. While ringing, keep app Home
visible; do not navigate to a second incoming screen. Decline should end this call without
opening the accepted-call overlay. Sending the same invitation again must not ring twice.

If it does not ring, check device Internet/DNS, token/platform routing, invitation expiry,
notifications, OS restrictions and native bootstrap. See [troubleshooting](/guides/troubleshooting).
A push provider accepting a request does not prove that the device received it.

## 4. Answer and connect real media

Install/configure the [LiveKit adapter](/guide/livekit) or wire [your native media engine](/guides/own-media).
For LiveKit, the authenticated backend must issue credentials for the same call room with distinct
participant identities. Never embed your server signing secret in the app.

Wire native answer/end callbacks to your backend. When the receiver accepts an outgoing call,
relay that acceptance to the caller's native ingress; the demo console stands in for this transport.
Do not set the caller active just because the remote user tapped Answer.

**Check:** acceptance enters `connecting`; real media connection enters `active`. Confirm that
both sides can hear each other on physical devices. An emulator/media callback proves connection,
not acoustic quality. End from either side and verify cleanup on both installations.

## 5. Add the screen, video and minimization

Follow [call UI](/guide/call-ui). Mount the supplied overlay once above navigation, or render
snapshots in your own screens. Keep a single call controller and media owner. With an adapter,
Dart/TypeScript should not also join the room from an answer event.

Add [video](/guide/video) only after audio works. Enable camera explicitly and verify local and
remote views separately. Test Back → mini-call → expand with the same call ID. Test Android
system PiP separately from the in-app mini-call; iOS system PiP is
[experimental](/guide/video#picture-in-picture-on-ios).

**Check:** minimizing changes presentation without ending or answering again. When both cameras
are off, the configured branding appears. Ending removes the overlay and mini-call.

## 6. Move from a working demo to acceptance

Use the [device checklist](/guides/testing): background/terminated app, lock-screen Answer and
Decline, remote cancel, expiry, duplicate invitations, interrupted media and process recovery.
Repeat on supported physical devices. Android force-stop is a separate OS restriction; do not
promise delivery from a killed-runtime test alone. Video on a secure lock screen needs its own trial.

For migration, also test old and new app versions using separate backend routes and verify
rollback. Keep dated results tied to app version, OS and device. Compare against
[current verification status](/project/status) before making production claims.
