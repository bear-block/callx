---
title: "Migrate from react-native-callkeep"
description: "Map react-native-callkeep's API and events to Callx, and move the incoming path from JavaScript to native."
---

# Migrate from react-native-callkeep

`react-native-callkeep` exposes CallKit and ConnectionService to JavaScript: your JavaScript
displays calls, listens for system actions and reports state back. Callx moves that loop into
native code, so the main change is deleting code rather than rewriting it.

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
| `RNCallKeep.setup(options)` | `CallxBootstrap` (native) + `callx.setup({appName})` |
| `displayIncomingCall(uuid, handle, name)` | Not needed: send a Callx invitation push. While running: `ingress.handleInvitation` (native) |
| `startCall(uuid, handle, name)` | `callx.startCall({callId, displayName, handle})` |
| `answerIncomingCall(uuid)` | `callx.answer(callId)` |
| `endCall(uuid)` / `rejectCall(uuid)` | `callx.end(callId)` |
| `reportEndCallWithUUID(uuid, reason)` | Native: `ingress.remoteEnded(callId, reason)` |
| `reportConnectedOutgoingCallWithUUID(uuid)` | Native: `ingress.remoteAnswered(callId)`, then `mediaConnected` |
| `setMutedCall(uuid, muted)` | `callx.setMuted(callId, muted)` |
| `setOnHold(uuid, held)` | `callx.setHeld(callId, held)` |
| `updateDisplay(uuid, name, handle)` | Not supported in this version |
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
   During the migration, send both formats if old app versions are still in use; Callx ignores
   messages without a `callx` field.
4. **Move media start** to the adapter or the native listener
   ([bring your own media](/guides/own-media)).
5. **Replace event listeners** with `callx.observe` and the commands above.
6. **Run the acceptance checklist** in [test on devices](/guides/testing), especially killed-app
   answers and lock-screen behaviour, which are where the behaviour changes most.

## What you may miss

Callx supports one live call. If your app relies on multiple simultaneous calls, call merging or
`updateDisplay`, check the [roadmap](/project/roadmap) before migrating.
