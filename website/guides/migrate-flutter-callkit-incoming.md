---
title: "Migrate from flutter_callkit_incoming"
description: "Map flutter_callkit_incoming's API and events to Callx, and let native code own the incoming path."
---

# Migrate from flutter_callkit_incoming

`flutter_callkit_incoming` shows CallKit and an Android incoming-call screen when Dart (or its
native push hook) asks it to, and reports actions back as events. Callx goes further: the native
core receives the push, decides whether to ring, records every action durably and tells Dart the
resulting state.

## What changes conceptually

| flutter_callkit_incoming | Callx |
|---|---|
| Dart or a background handler calls `showCallkitIncoming` | The native ingress rings from the push itself |
| `firebase_messaging` background handler on Android | FCM goes to `handlePush` natively; no Dart isolate needed |
| Events (`actionCallAccept`, …) that Dart must be alive to receive | Actions committed natively; Dart reads a snapshot and replay |
| `activeCalls()` to rebuild state | `getSnapshot()` / `openSession()` |
| `setCallConnected(id)` | `mediaConnected`, reported by your media (or the adapter) |

## API mapping

| flutter_callkit_incoming | Callx |
|---|---|
| `showCallkitIncoming(CallKitParams)` | Send a Callx invitation push; while running, `ingress.handleInvitation` (native) |
| `startCall(params)` | `callx.startCall(CallInput(...))` |
| `endCall(id)` / `endAllCalls()` | `callx.end(callId)` |
| `setCallConnected(id)` | `runtime.mediaConnected(callId)` (native) or the media adapter |
| `muteCall(id, isMuted: …)` | `callx.setMuted(callId, muted)` |
| `holdCall(id, isOnHold: …)` | `callx.setHeld(callId, held)` |
| `activeCalls()` | `callx.getSnapshot()` |
| `getDevicePushTokenVoIP()` | `callx.pushToken()` (VoIP on iOS, FCM on Android) |
| `showMissCallNotification` | Your own notification on `endReason == unanswered` |

## Event mapping

| flutter_callkit_incoming `Event` | Callx |
|---|---|
| `actionCallIncoming` | `CallState.incoming` |
| `actionCallAccept` | `CallState.connecting` |
| `actionCallDecline` | `CallState.ended`, `EndReason.declined` |
| `actionCallEnded` | `CallState.ended`, `EndReason.localHangup` or `remoteEnded` |
| `actionCallTimeout` | `CallState.ended`, `EndReason.unanswered` |
| `actionCallToggleMute` | `call.muted` |
| `actionCallToggleHold` | `CallState.held` |
| `actionDidUpdateDevicePushTokenVoip` | Native listener `pushTokenUpdated`, or `callx.pushToken()` |

```dart
// Before
FlutterCallkitIncoming.onEvent.listen((event) {
  if (event?.event == Event.actionCallAccept) joinRoom(event!.body['id']);
});

// After: media joins natively; Dart renders the state.
callx.snapshots.listen((snapshot) => render(snapshot.call));
```

## Steps

1. **Remove** `flutter_callkit_incoming` and the code that called `showCallkitIncoming` from push
   handlers.
2. **Install** `callx` and follow the [Flutter quick start](/guide/flutter), including the
   native bootstrap and the FCM service.
3. **Change the push payload** to the [Callx invitation](/guides/backend). Keep sending the old
   one while old app versions are in use; Callx ignores messages without a `callx` field.
4. **Move media start** to the [LiveKit adapter](/guide/livekit) or the
   [native listener](/guides/own-media).
5. **Replace the event listener** with `callx.snapshots`.
6. **Run the acceptance checklist** in [test on devices](/guides/testing).

## Differences to plan for

- The Android incoming screen is Callx's native screen or your own Activity
  (`fullScreenIntent`). Callx does not take styling parameters like `CallKitParams.android`;
  provide your own Activity for a custom design.
- On iOS, provide your `CXProviderConfiguration` (icon, ringtone) through the bootstrap's
  `providerConfiguration`.
- One live call at a time.
