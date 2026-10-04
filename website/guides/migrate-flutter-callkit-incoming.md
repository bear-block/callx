---
title: "Migrate from flutter_callkit_incoming"
description: "Map flutter_callkit_incoming's API and events to Callx, and let native code own the incoming path."
---

# Migrate from flutter_callkit_incoming

`flutter_callkit_incoming` shows CallKit and an Android incoming-call screen when Dart (or its
native push hook) asks it to, and reports actions back as events. Callx goes further: the native
core receives the push, decides whether to ring, records every action durably and tells Dart the
resulting state.

Before removing packages, read [rollout and rollback](/guides/migration-rollout) and audit your
backend routes and media owner. Migrating a development build and retiring old production
clients are separate steps.

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
| `showMissCallNotification` | Automatic on Android (unanswered or caller-cancelled), with a Call back action; `CallStylePresenter(missedCalls = false)` to send your own. iOS lists missed calls in Recents |
| `actionCallToggleDmtf` / keypad | `callx.sendDtmf(callId, digits)` with a DTMF-capable adapter |
| `actionCallToggleAudioSession`, speaker toggles | `call.audioRoutes` and `callx.setAudioRoute(callId, route.id)` |

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
| `actionCallCallback` (missed-call Call back) | `Callx.callRequests`, then `startCall` if you agree |

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
3. **Change the push payload** to the [Callx invitation](/guides/backend). Route old payloads to old installations and Callx payloads to migrated installations.
   Do not enable both presenters for one invitation.
4. **Move media start** to the [LiveKit adapter](/guide/livekit) or the
   [native listener](/guides/own-media).
5. **Replace the event listener** with `callx.snapshots`.
6. **Run the acceptance checklist** in [test on devices](/guides/testing).

## Differences to plan for

- Android uses the native incoming presenter. Customization currently uses Kotlin presenter
  hooks in `CallxBootstrapConfig`; a unified Dart appearance switch is planned. See
  [native host integration](/guides/native-host) and [UI choices](/guide/call-ui).
- On iOS, provide your `CXProviderConfiguration` (icon, ringtone) through the bootstrap's
  `providerConfiguration`.
- One live call at a time.

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
