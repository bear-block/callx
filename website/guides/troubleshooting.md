---
title: "Troubleshooting"
description: "Symptoms, causes and fixes for missing rings, missing audio, setup errors and state problems."
---

# Troubleshooting

Start with the symptom. Turn on the bootstrap's `log` option first; its lines explain most
problems without exposing tokens or payloads.

## The phone does not ring

| Check | How |
|---|---|
| The push reached the device | Android: `onPushReceived` in your listener. iOS: Console.app, filter by your process |
| It was a Callx invitation | `handlePush` returns `false` for messages without a `callx` field |
| It was allowed to ring | `onInvitationRejected` / `invitationRejected` gives the outcome: `Duplicate`, `Busy`, `Expired` or `Ended` |
| `expiresAtMs` is in the future | Compare with the device clock; skewed clocks expire invitations early |
| iOS: VoIP token and topic match | Topic is `<bundle id>.voip`; sandbox tokens only work with `api.sandbox.push.apple.com` |
| iOS: Do Not Disturb or Focus | CallKit refuses the report; the call is recorded as `failed` |
| Android: high priority, no `notification` block | `android.priority: HIGH`; compare delivered and original priority in `onPushReceived` |
| Android: app force-stopped | No FCM is delivered until the user opens the app again |
| Android: vendor battery manager | See [Android](/platforms/android#vendor-battery-managers) |
| Android: device has no Telecom | Bootstrap throws `UnsupportedOperationException`; `nativeCalling` is `false` |

## It rings as a notification, not full screen (Android)

Android shows the full-screen incoming screen only when the device is locked or the screen is
off; in use, a heads-up notification is correct. If it never goes full screen, Android 14+ may
have denied full-screen intents: check `CallxFullScreenIntent.isAllowed(context)`.

## Answered, but no audio

| Check | How |
|---|---|
| Media was started | Adapter: `started.media` is `Adapter(...)`. Your own: `onCallAnswered` / `callAnswered` fired |
| Microphone permission | Without it, LiveKit stays listen-only. The prompt cannot appear on the lock screen; ask earlier |
| iOS: audio waits for `didActivate` | Your engine must start audio in `didActivate`, with automatic session handling off |
| Android: no competing router | Turn off your SDK's route manager; route with `requestAudioEndpoint` |
| Credentials | LiveKit: check the token endpoint answers `{url, token}` for that `callId` |

A call that stays `connecting` means `mediaConnected` was never reported. That is media, not
signaling.

## Setup errors

| Error | Cause |
|---|---|
| `nativeUnavailable` | The app was not rebuilt after installing, or you are on web or Expo Go |
| `notConfigured`, or `nativeCalling: false` | The bootstrap did not run before `setup`, or it failed |
| `invalidArgument` with "contract version" | Native and JavaScript or Dart parts come from different versions; reinstall and rebuild |
| Android manifest merge fails on `minSdk` | Set `minSdk` to 29 |
| iOS: `No such module 'callx'` | Flutter: run `flutter pub get` and rebuild. RN: `pod install` |
| Bootstrap throws `IllegalStateException` | Two media adapters are installed; remove one |

## State and observation

| Symptom | Cause |
|---|---|
| Observer stopped receiving | Another session replaced it, or the runtime was replaced (account switch) without re-subscribing |
| `resynced` on reopen | Your cursor is older than the retained journal; adopt the snapshot |
| `queryOperation` returns `unavailable` | Pending, never received or pruned; reconcile with your backend before retrying |
| `generationMismatch` | The login changed, or the host did not restore a stable `accountGeneration` |
| A call disappeared from the snapshot | Ended calls are removed after five minutes; keep your own history |

## Still stuck?

Open a [GitHub issue](https://github.com/bear-block/callx/issues) with the platform, OS version,
device model, Callx version, framework version and the bootstrap's log lines around the problem.
Remove tokens and personal data first.
