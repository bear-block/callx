---
title: "Native API"
description: "The Kotlin and Swift types a native host uses: bootstrap, ingress, runtime, listeners, push tokens and media adapters."
---

# Native API

::: info Prepared 0.3.0 APIs
Audio routes, DTMF, caller name updates and system call requests are documented in
[phone features](/guide/phone-features). Publication is pending; 0.2.4 remains the published version.
:::


The native API is the same in both framework packages; only the module name and the framework
entry point differ.

| | Flutter | React Native |
|---|---|---|
| Android entry point | `dev.callx.flutter.CallxPlugin` | `dev.callx.reactnative.CallxModule` |
| iOS module | `import callx` | `import callx_react_native` |
| iOS entry point | `CallxPlugin` | `CallxReactNativeHost` |

Kotlin types live in `dev.callx.core` and `dev.callx.telecom`.

## Bootstrap

| Kotlin | Swift | Description |
|---|---|---|
| `CallxPlugin.bootstrap(context, config)` / `CallxModule.bootstrap(context, config)` | `CallxPlugin.bootstrap(config)` / `CallxReactNativeHost.bootstrap(config)` | Builds and installs the whole pipeline |
| `CallxBootstrapConfig` | `CallxBootstrapConfig` | Options; see [native host integration](/guides/native-host#bootstrap-options) |
| `CallxBootstrap.started` | | The running pipeline after bootstrap (Android) |
| `Started.runtime`, `.ingress`, `.media`, `.recoveredCall` | `CallxBootstrap.runtime`, `.ingress`, `.provider`, `.media`, `.ready` | What the bootstrap built. On iOS, `ready` completes with the recovered call after recovery |
| `CallxMediaStatus` | `CallxMediaStatus` | `Adapter(source)`, host-controlled, or none |

## Push tokens

| Kotlin | Swift | Description |
|---|---|---|
| `CallxPushTokens.updateFcm(token)` | | Records the FCM token for `getPushToken()` |
| `CallxPushTokens.current` | `CallxPushTokens.current` | The recorded token |
| | `CallxPushTokens.updateVoIP(token)` | Records a VoIP token (the bootstrap does this) |

On iOS the bootstrap records the VoIP token itself.

## Ingress

`TelecomIngress` (Android) and `CallKitIngress` (iOS).

| Member | Description |
|---|---|
| `handlePush(data, priority, originalPriority)` (Android) | Rings or rejects a forwarded FCM message; `false` if it is not a Callx invitation |
| `handleInvitation(invitation)` | An invitation that arrived over signaling |
| `remoteAnswered(callId)` | The remote side answered an outgoing call |
| `remoteEnded(callId, reason)` | The remote side ended or cancelled; recorded even before the invitation |
| `silenceIncoming(callId)` (Android) | Stops the ringtone |
| `requestAudioEndpoint(callId, endpoint)` (Android) | Switches audio route through Telecom |
| `recoverAfterProcessDeath()` | Cleanup after a previous process died; the bootstrap calls it |
| `startPushRegistry()` (iOS) | Registers for VoIP pushes; the bootstrap calls it |
| `TelecomIngress.EXTRA_CALL_ID` | Intent extra with the answered call's ID |

## Runtime

`BridgeRuntime`

| Member | Description |
|---|---|
| `mediaConnected(callId)` | Media flows (first time or after an interruption) |
| `mediaInterrupted(callId)` | Connected media dropped |
| `reportIncoming(…)`, `platformAnswered(callId)`, `platformEnded(callId, reason)`, `remoteEnded(callId, reason)` | Provider-managed mode only |

## Listeners

### `TelecomIngressListener` (Android)

| Callback | When |
|---|---|
| `onPushReceived(callId?, priority?, originalPriority?)` | A Callx message arrived |
| `onInvitationAccepted(invitation)` | The call rings |
| `onInvitationRejected(invitation?, outcome?)` | It does not ring: `Duplicate`, `Busy`, `Expired`, `Ended(reason)` |
| `onUserAnswered(callId)` / `onUserEnded(callId)` | The user acted from the notification |
| `onCallAnswered(callId)` | Answered, from any surface. Start media |
| `onCallEnded(callId)` | Ended, for any reason. Stop media |
| `onRingTimedOut(callId)` | The ring deadline passed |
| `onAudioEndpointsChanged(callId, current, available)` | Audio routes changed |

### `CallKitIngressListener` (iOS)

| Callback | When |
|---|---|
| `pushTokenUpdated(_:)` / `pushTokenInvalidated()` | VoIP token changes |
| `invitationAccepted(_:)` | The call rings |
| `invitationRejected(_:outcome:)` | It does not ring |
| `callAnswered(callID:)` | Answered, from any surface. Prepare media |
| `callEnded(callID:)` | Ended, for any reason. Stop media |
| `ringTimedOut(callID:)` | The ring deadline passed |

## Android presentation

| Type | Description |
|---|---|
| `CallStylePresenter(context, channelId, smallIcon, fullScreenIntent, contentIntent, labels, lockedAnswer)` | The default notification presenter |
| `CallNotificationLabels` | `answer`, `decline`, `hangUp`, `openApp`, `incomingChannel`, `ongoingChannel` |
| `LockedAnswer` | `RequireUnlock`, `ShowOverLockScreen` |
| `CallxLockScreen.onIntent(activity, intent)` | Needed with `ShowOverLockScreen` |
| `CallxFullScreenIntent.isAllowed(context)` / `.settingsIntent(context)` | Android 14+ full-screen intent permission |
| `CallxTelecomAvailability.requireSupported(context)` | Throws when the device has no Telecom |
| `IncomingCallPresenter` | Implement for full control of the notification |
| `TelecomSystemActionHandler` | Backend work for actions from watches and cars |

## iOS actions and audio

| Type | Description |
|---|---|
| `CallKitActionPerforming` | Backend work per CallKit action; return `false` to fail it |
| `CallKitAudioSessionHandling` | `didActivate(_:)`, `didDeactivate(_:)` |
| `MediaRoutingPerformer` | Wraps a performer so mute actions reach the media adapter |

## Media adapters

| Kotlin | Swift |
|---|---|
| `CallxMediaAdapter` (`apiVersion`, `start`, `stop`, `setMuted`) | `CallxMediaAdapter` (same, plus audio session callbacks) |
| `CallxMediaSink` (`connected`, `interrupted`) | `CallxMediaSink` |
| `CallxMediaAdapterFactory.create(context)` | `CallxMediaAdapterFactory.makeAdapter(context:)` |
| `CallxAdapterContext(context, scope, log)` | `CallxAdapterContext(log:)` |
| Manifest `dev.callx.media.<provider>` | `Info.plist` `CallxMediaAdapterFactories` |

See [write a media adapter](/guides/write-an-adapter).

## LiveKit adapter (native)

| Kotlin | Swift |
|---|---|
| `CallxLiveKit.configure(context, tokenUrl, headers)` | `CallxLiveKit.configure(tokenURL:headers:)` |
| `CallxLiveKit.setCredentialProvider { callId -> LiveKitCredentials(url, token) }` | `CallxLiveKit.setCredentialProvider { callID in … }` |
| `CallxLiveKit.reset(context)` | `CallxLiveKit.reset()` |
