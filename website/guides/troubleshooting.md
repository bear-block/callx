---
title: "Troubleshooting"
description: "Symptoms, causes and fixes for missing tokens, missing rings, calls that never connect, phones that keep ringing, missing audio, setup errors and state problems."
---

# Troubleshooting

Find your symptom, then work down its table. Turn on the bootstrap's `log` option first; its
lines explain most problems without exposing tokens or payloads.

| Symptom | Go to |
|---|---|
| `getPushToken()` / `pushToken()` returns `null` | [No push token](#no-push-token) |
| The push is sent, nothing happens on the phone | [The phone does not ring](#the-phone-does-not-ring) |
| Your other push notifications stopped, or Callx pushes never arrive (Android) | [Another library receives the FCM messages](#another-library-receives-the-fcm-messages) |
| iOS kills the app when a push arrives, or VoIP pushes stop | [iOS: killed on push, or pushes stop](#ios-killed-on-push-or-pushes-stop) |
| Android shows a heads-up notification instead of the full-screen call | [Notification, not full screen](#it-rings-as-a-notification-not-full-screen-android) |
| The callee answered, the caller still shows "calling" | [The caller never connects](#the-caller-never-connects) |
| One phone hung up, the other keeps ringing or stays in the call | [The other phone does not end](#the-other-phone-does-not-end) |
| Answered, `connecting` forever, or no sound | [Answered, but no audio](#answered-but-no-audio) |
| An error from `setup()` or a command, or a build error | [Setup errors](#setup-errors) |
| Observers stop, `resynced`, `generationMismatch` | [State and observation](#state-and-observation) |

## No push token

The token is `null` until the platform has issued one to Callx.

| Check | How |
|---|---|
| Native bootstrap ran | `capabilities.nativeCalling` is `true`; otherwise see [setup errors](#setup-errors) |
| Android: Firebase is configured | `google-services.json` is in `android/app` and the Google Services Gradle plugin is applied |
| Android: tokens reach Callx | `Application.onCreate` passes the current token to `CallxPushTokens::updateFcm`, and your messaging service's `onNewToken` calls it too ([Flutter](/guide/flutter#_3-bootstrap-the-native-core), [React Native](/guide/react-native#_3-bootstrap-the-native-core)) |
| iOS: capabilities | **Push Notifications** and the **Voice over IP** background mode are enabled for the app target |
| iOS: PushKit is started | `startPushRegistry` is left at `true` in the bootstrap configuration |
| iOS: a real iPhone | The Simulator does not receive VoIP pushes |

Ask again after a moment: the platform issues the token asynchronously on first launch, and the
token can change later. Send the new one to your backend whenever it changes.

## The phone does not ring

| Check | How |
|---|---|
| The push reached the device | Android: `onPushReceived` in your listener. iOS: Console.app, filter by your process. An FCM or APNs `200` only means the request was accepted for delivery |
| It was a Callx invitation | `handlePush` returns `false` for messages without a `callx` field |
| It was allowed to ring | `onInvitationRejected` / `invitationRejected` gives the outcome: `Duplicate`, `Busy`, `Expired` or `Ended` |
| The `callId` is new | Callx never rings an ID it has seen end in the last 24 hours. Use a fresh UUID for every call, including repeated test pushes (the testkit makes one unless you pass `--call-id`) |
| `expiresAtMs` is in the future | Compare with the device clock; skewed clocks expire invitations early |
| iOS: VoIP token and topic match | Topic is `<bundle id>.voip`; sandbox tokens only work with `api.sandbox.push.apple.com` |
| iOS: Do Not Disturb or Focus | CallKit refuses the report; the call is recorded as `failed` |
| Android: high priority, no `notification` block | `android.priority: HIGH`; compare delivered and original priority in `onPushReceived` |
| Android: FCM `ttl` | Set it to the seconds left until `expiresAtMs`, not `0s`: a zero TTL is dropped whenever the phone is not connected at that instant |
| Android: app force-stopped | No FCM is delivered until the user opens the app again |
| Android: vendor battery manager | See [Android](/platforms/android#vendor-battery-managers) |
| Android: device has no Telecom | Bootstrap throws `UnsupportedOperationException`; `nativeCalling` is `false` |
| After a reboot, before the first unlock | Calls are missed until the user unlocks once ([iOS](/platforms/ios#before-the-first-unlock), [Android](/platforms/android#before-the-first-unlock)) |

## Another library receives the FCM messages

Android delivers FCM messages to one `FirebaseMessagingService` only. If `firebase_messaging`,
`@react-native-firebase/messaging` or another SDK declares its own service, either Callx or that
library stops receiving messages.

- **React Native with `@react-native-firebase/messaging`:** extend
  `ReactNativeFirebaseMessagingService`, call `super.onMessageReceived(message)` for messages
  `handlePush` does not take, and replace the library's manifest entry with yours
  (`tools:node="replace"`). The [Expo plugin](/guide/expo) generates exactly this.
- **Flutter with `firebase_messaging`, or any other SDK:** keep one service, yours, and forward
  the messages Callx does not take to the other library.
- Check the merged manifest (Android Studio, **Merged Manifest** tab) for more than one service
  with the `com.google.firebase.MESSAGING_EVENT` action.

## iOS: killed on push, or pushes stop

iOS terminates an app that does not report a VoIP push to CallKit before the handler returns,
and stops delivering VoIP pushes to apps that keep failing. Callx reports every push natively,
so this happens only when something else is involved:

| Check | How |
|---|---|
| Callx is the only PushKit owner | Remove `react-native-voip-push-notification`, `flutter_callkit_incoming`'s VoIP handling and any native code that creates its own `PKPushRegistry` ([migrating](/guides/migrate-callkeep)) |
| The bootstrap runs at launch | Call it in `application(_:didFinishLaunchingWithOptions:)`, before the framework starts, not from Dart or JavaScript |
| Only invitations are VoIP pushes | Send `call.ended` and other events over your signaling connection, never as VoIP pushes ([why](/platforms/ios#the-reporting-rule)) |

## It rings as a notification, not full screen (Android)

Android shows the full-screen incoming screen only when the device is locked or the screen is
off; in use, a heads-up notification is correct. If it never goes full screen, Android 14+ may
have denied full-screen intents: check `CallxFullScreenIntent.isAllowed(context)`.

## The caller never connects

The callee answered, but the caller's call stays `outgoing`. Callx on the caller's phone learns
about the answer only from your backend.

| Check | How |
|---|---|
| The backend recorded the answer | With LiveKit, the callee's token request claims the answer ([media credentials](/backend/media#let-the-token-request-claim-the-answer)); otherwise your `POST /answer` |
| The backend sent `call.accepted` | To the caller, over your signaling connection |
| The app passed it to Callx | `reportRemoteAnswered(callId)` (TypeScript), `CallxSignaling.remoteAnswered(callId)` (Dart) or `ingress.remoteAnswered` natively. It resolves `true` when the call changed |
| The IDs match | The caller's `startCall` used the same `callId` the backend created and pushed |

`reportRemoteAnswered` rejecting with `nativeUnavailable` means the installed native module is
older than 3.0.1: rebuild the app. After `call.accepted`, the caller moves to `connecting`, then
`active` once media flows.

## The other phone does not end

One side hung up, declined or was answered elsewhere, and the other phone keeps ringing or
stays in the call.

| Check | How |
|---|---|
| The ending phone told the backend | Report ends this phone decided (`localHangup`, `declined`, `unanswered`) to your end endpoint ([how](/guide/#_5-connect-your-backend-both-ways)) |
| The backend sent `call.ended` to every other device | Including the callee's other devices, with `answeredElsewhere` |
| The app passed it to Callx | `reportRemoteEnded(callId, reason)`, `CallxSignaling.remoteEnded(...)` or `ingress.remoteEnded` natively |
| The app was not running | No Dart or JavaScript runs to receive the event. On Android, also send `call.ended` as a [normal-priority push signal](/backend/call-flows#caller-cancels-or-nobody-answers); on both platforms, the invitation's expiry and your server timer end the call |

A decline from the lock screen of a killed app runs no Dart or JavaScript either. Report it with
a [native listener](/guides/native-host#listener-callbacks), or let the backend's expiry timer end
the call as `unanswered`.

## Answered, but no audio

| Check | How |
|---|---|
| Media was started | Adapter: `started.media` is `Adapter(...)`. Your own: `onCallAnswered` / `callAnswered` fired |
| Microphone permission | Without it, LiveKit stays listen-only. The prompt cannot appear on the lock screen; ask earlier |
| iOS: audio waits for `didActivate` | Your engine must start audio in `didActivate`, with automatic session handling off |
| Android: no competing router | Turn off your SDK's route manager; route with `requestAudioEndpoint` |
| Credentials | LiveKit: check the token endpoint answers `{url, token}` for that `callId` |
| Both sides joined the same room | LiveKit: both tokens are for `call-<callId>`, with different identities |

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

All error codes are in the [errors reference](/reference/errors).

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
