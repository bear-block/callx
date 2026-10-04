---
title: "Migrate from react-native-callkeep"
description: "Map react-native-callkeep's API and events to Callx, and move the incoming path from JavaScript to native."
---

# Migrate from react-native-callkeep

`react-native-callkeep` exposes CallKit and ConnectionService to JavaScript: your JavaScript
displays calls, listens for system actions and reports state back. Callx moves that loop into
native code, so migration moves lifecycle ownership, media startup and backend callbacks as well as UI code.

Before removing packages, read [rollout and rollback](/guides/migration-rollout) and audit your
backend routes and media owner. Migrating a development build and retiring old production
clients are separate steps.

## What changes conceptually

| react-native-callkeep | Callx |
|---|---|
| JavaScript calls `displayIncomingCall` when a push arrives | The native ingress reports the call from the push itself |
| A VoIP push library (`react-native-voip-push-notification`) plus native glue to report in time | Callx owns PushKit; no extra library |
| Android headless JS task or `backgroundMessaging` to show the call | Forward FCM to `handlePush`; no headless JS |
| `answerCall` / `endCall` events, which can arrive before your listener | Actions are committed natively; you read a snapshot and replay |
| JavaScript tracks the call's state | `callx.observe` gives the state; the core owns it |
| `ConnectionService` and phone account setup | Core-Telecom, self-managed; no phone account prompt |

## API mapping

| react-native-callkeep | Callx |
|---|---|
| `RNCallKeep.setup(options)` | `CallxBootstrap` (native) + `callx.setup()`. The call screen shows your app's name; CallKit options go in `providerConfiguration` |
| `displayIncomingCall(uuid, handle, name)` | Not needed: send a Callx invitation push. While running: `ingress.handleInvitation` (native) |
| `startCall(uuid, handle, name)` | `callx.startCall({callId, displayName, handle})` |
| `answerIncomingCall(uuid)` | `callx.answer(callId)` |
| `endCall(uuid)` / `rejectCall(uuid)` | `callx.end(callId)` |
| `reportEndCallWithUUID(uuid, reason)` | Native: `ingress.remoteEnded(callId, reason)` |
| `reportConnectedOutgoingCallWithUUID(uuid)` | Native: `ingress.remoteAnswered(callId)`, then `mediaConnected` |
| `setMutedCall(uuid, muted)` | `callx.setMuted(callId, muted)` |
| `setOnHold(uuid, held)` | `callx.setHeld(callId, held)` |
| `updateDisplay(uuid, name, handle)` | `callx.setDisplayName(callId, name)`. The handle cannot change; Android cars and watches keep the first name |
| `sendDTMF(uuid, key)` | `callx.sendDtmf(callId, digits)` with a DTMF-capable adapter (`capabilities.dtmf`) |
| `getAudioRoutes()` / `setAudioRoute(uuid, route)` | `call.audioRoutes` / `callx.setAudioRoute(callId, route.id)` |
| `backToForeground()` | Automatic: answering opens your app (Android: see `LockedAnswer`) |
| `checkPhoneAccountPermission` / `hasPhoneAccount` | Not needed with Core-Telecom; check `capabilities.nativeCalling` |

## Event mapping

Instead of subscribing to many events, observe one snapshot:

| react-native-callkeep event | Callx |
|---|---|
| `didDisplayIncomingCall` | `call.state === 'incoming'` |
| `answerCall` | `call.state === 'connecting'` (and native `onCallAnswered` for backend work) |
| `endCall` | `call.state === 'ended'` with `call.endReason` |
| `didPerformSetMutedCallAction` | `call.muted` |
| `didToggleHoldCallAction` | `call.state === 'held'` |
| `didActivateAudioSession` | Handled natively by the media adapter, or your `didActivate` |
| `didPerformDTMFAction` | The CallKit keypad goes to the media adapter's DTMF method natively |
| `didChangeAudioRoute` | `call.audioRoute` and `call.audioRoutes` |
| `didReceiveStartCallAction` (Recents, Siri) | `callx.addCallRequestListener(request => …)`, then `startCall` if you agree |
| `didLoadWithEvents` (events before JS loaded) | Not needed: `openSession()` returns a snapshot and replay |

```ts
// Before
RNCallKeep.addEventListener('answerCall', ({callUUID}) => joinRoom(callUUID));
RNCallKeep.addEventListener('endCall', ({callUUID}) => leaveRoom(callUUID));

// After: media is joined natively by the adapter; the UI only renders.
callx.observe(({call}) => render(call));
```

## Steps

1. **Remove** `react-native-callkeep`, `react-native-voip-push-notification` and any headless JS
   task for calls. Remove the native code that reported VoIP pushes to CallKit.
2. **Install** `@bear-block/callx`, follow the [React Native](/guide/react-native) or
   [Expo](/guide/expo) quick start.
3. **Change the push payload** your backend sends to the [Callx invitation](/guides/backend).
   Route the old format to old installations and Callx invitations to migrated installations.
   Do not send both incoming reporting paths to the same installation.
4. **Move media start** to the adapter or the native listener
   ([bring your own media](/guides/own-media)).
5. **Replace event listeners** with `callx.observe` and the commands above.
6. **Run the acceptance checklist** in [test on devices](/guides/testing), especially killed-app
   answers and lock-screen behaviour, which are where the behaviour changes most.

## What you may miss

Callx supports one live call. If your app relies on multiple simultaneous calls or call merging,
check the [roadmap](/project/roadmap) before migrating. Audio routes, DTMF, `updateDisplay` and
Recents call-back have Callx equivalents since 3.0.0; see [phone features](/guide/phone-features).

## A complete migration journey

Start with [your personalized setup](/guide/setup), then use
[migration rollout and rollback](/guides/migration-rollout) to audit handlers, route payloads
per installation, replace native/media ownership, verify mixed app versions and plan rollback.
The API mapping above is one part of that journey.

Before deleting old answer-event code, identify everything it did: accepting on your backend,
joining media, starting timers and navigating. Move backend/media work to the native lifecycle
owner; timers/navigation render the observed accepted call. Keep exactly one room join path.
A framework observer may see an already-active call when it starts; do not assume you will
always receive a fresh connecting transition.

After the first foreground call works, repeat with the framework runtime stopped and with the
screen locked. Confirm native callbacks complete their backend responsibilities, and that
opening the app reconciles the current snapshot without re-answering. Compare dated results
against [verification status](/project/status).
