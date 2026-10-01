---
title: "Android"
description: "Core-Telecom, FCM, notifications and full-screen intents, the lock screen, vendor battery managers and other Android specifics."
---

# Android

On Android, Callx uses Jetpack Core-Telecom as a self-managed calling app, a CallStyle
notification and its own native incoming-call screen. Requirements: Android 10 (API 29) or later,
compile SDK 36.

## Setup checklist

- [ ] `minSdk = 29`.
- [ ] Firebase Messaging, and a service that forwards to `handlePush` (or the Expo plugin's
      `androidPush: "fcm"`).
- [ ] `RECORD_AUDIO` and `POST_NOTIFICATIONS` declared, and requested at runtime while the app is
      in use.
- [ ] The bootstrap in `Application.onCreate`.

Callx's manifest declares `MANAGE_OWN_CALLS`, `USE_FULL_SCREEN_INTENT` and its incoming-call
Activity.

## Telecom

Callx registers the app with Core-Telecom and adds each call to Telecom before posting its
notification. That gives you:

- Correct behaviour with cellular calls, Bluetooth headsets, watches and cars.
- Audio routing through Telecom's endpoints (speaker, earpiece, Bluetooth).
- No phone account setup and no call-log permission.

Core-Telecom uses the platform's transactional calling API on Android 14+ and ConnectionService
below. Devices that do not implement Telecom (some tablets and Android Go builds) report calling
as unavailable instead of crashing.

## Notifications and the incoming screen

- **Incoming**: a CallStyle notification with Answer and Decline, on a dedicated channel that
  repeats the system ringtone until the call is answered, declined, silenced or removed.
- **Locked or screen off**: Callx's native incoming-call screen appears full screen immediately.
  It is plain Android views, so it does not wait for Flutter or React Native.
- **In use**: a heads-up notification. This is Android's behaviour for full-screen intents.
- **Ongoing**: a silent notification with a running timer from the answer time.
- **Volume down** on the incoming screen silences the ringtone.

Because the call is in Telecom, Android shows the call notification even if the user blocked the
app's other notifications.

### Full-screen intents on Android 14+

Android 14 lets users, and Google Play policy, deny full-screen intents to apps. Calls then
appear as heads-up notifications. Google Play allows the permission for apps whose core function
is calling. Check with `CallxFullScreenIntent.isAllowed(context)` and open the setting with
`CallxFullScreenIntent.settingsIntent(context)`.

## Answering on the lock screen

Choose with `CallStylePresenter(lockedAnswer = …)`:

- `RequireUnlock` (default): the call connects; Android asks for unlock; a native call screen
  stays on the lock screen until then.
- `ShowOverLockScreen`: your app opens over the lock screen. Use only if that screen shows nothing
  but the call.

## FCM delivery

- Send invitations with `priority: HIGH` and no `notification` block.
- FCM gives the app a short window to process a high-priority message; `handlePush` finishes
  inside it.
- FCM may deprioritize apps whose high-priority messages do not produce a visible notification.
  Do not push invitations you know will not ring.
- A **force-stopped** app (Settings → Force stop) receives no FCM until the user opens it again.
  Swiping the app away from Recents is not a force stop on most devices.

## Vendor battery managers

Some vendors add their own process killers on top of Android's: Xiaomi (MIUI/HyperOS) Autostart,
Oppo and Realme (ColorOS) and Vivo background restrictions, Huawei app launch management, Samsung
"sleeping apps". When they block an app, FCM messages may never wake it, and no library can work
around that.

What you can do:

- Ask users of those devices to allow autostart or unrestricted battery use for your app, with a
  short explanation, after the first missed call rather than at install.
- Link to the vendor-specific instructions collected at [dontkillmyapp.com](https://dontkillmyapp.com).
- Test on the vendors your users have (see [test on devices](/guides/testing)).

## Before the first unlock

After a reboot, apps that are not direct-boot aware do not run until the user unlocks once. Calls
that arrive before that are missed. Direct-boot support is on the [roadmap](/project/roadmap).

## Microphone in the background

The microphone permission prompt cannot appear over the lock screen. Ask while the app is in use,
before the first call. Without the permission, the LiveKit adapter keeps the call connected in
listen-only mode.
