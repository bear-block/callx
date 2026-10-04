---
title: "Phone features"
description: "Audio routes, keypad tones, caller name updates and system call requests in Callx 0.3.0."
---

# Phone features

::: warning Publication pending
These APIs belong to the prepared **0.3.0** packages and contract. The published 0.2.4 packages do
not expose them. Install 0.3.0 after publication; rebuild the native app, including Expo development
builds. Updating JavaScript or Dart alone does not install the new native APIs.
:::

Callx keeps call state in native code. Route selection, tones and caller name updates use the same
operation IDs, deadlines and result handling as answer, mute and hold. They work with native UI,
your own Flutter/React Native UI and the supplied call UI.

## Audio routes

Read `audioRoutes` and `audioRoute` from the observed call. Routes are reported by the OS; wait for
them instead of inventing IDs or assuming Bluetooth is available. The current route can be unknown.
The list changes when a headset connects or disconnects and clears when the call ends.

```ts
const off = callx.observe(({call}) => {
  if (!call) return;
  // Populate your route picker with call.audioRoutes ?? [].
  console.log(call.audioRoute, call.audioRoutes);
});
// In your picker handler, route.id comes from that observed list.
const result = await callx.setAudioRoute(callId, route.id);
```

```dart
final result = await callx.setAudioRoute(callId, route.id);
```

A route can be selected while outgoing, connecting, active or held. An unlisted ID returns
`invalidArgument`; an OS refusal returns `platformRejected`. Android uses Core-Telecom endpoint
changes. iOS uses the CallKit-activated audio session; Callx does not take audio session ownership
away from CallKit. Physical Bluetooth, wired headset and car behavior still need device acceptance.

## Keypad tones

```ts
const capabilities = await callx.setup();
if (capabilities.dtmf) {
  const result = await callx.sendDtmf(callId, '12#');
}
```

```dart
if ((await callx.setup()).dtmf) {
  final result = await callx.sendDtmf(callId, '12#');
}
```

DTMF accepts 1–32 characters from `0–9`, `*` and `#`, and requires an active call. Tones do not
change call state; the journal records the operation result. Adapters opt in through
`CallxDtmfAdapter` (Kotlin) or `CallxDTMFAdapter` (Swift); without one the command is `unsupported`.
LiveKit publishes SIP DTMF packets, so your room needs a SIP participant to deliver keypad input to
a telephone/IVR. `applied` confirms SDK publication, not acknowledgement by the remote IVR.
See [LiveKit DTMF](https://docs.livekit.io/telephony/features/dtmf/).

## Update the displayed caller name

```ts
await callx.setDisplayName(callId, 'Steven');
```

```dart
await callx.setDisplayName(callId, 'Steven');
```

Use this when your backend resolves a caller's name after reporting the call. The name must be
1–256 UTF-8 bytes. iOS updates CallKit; Android updates Callx's notification. Android cars and
watches keep the original name because the supported Core-Telecom API cannot rename a registered
call. This does not change the call handle.

## Requests from outside the app

A request to call someone is **not an incoming invitation or a call command**. Listen early,
resolve the handle against your signed-in account and contacts, then decide whether to call
`startCall`. Native code holds the latest unconsumed request for 60 seconds; this is a launch
handoff, not a durable queue. Use one app-level consumer.

```ts
const stop = callx.addCallRequestListener(request => {
  // Look up request.handle in your contacts and ask your calling flow to start.
  // request.displayName may be absent; request.video is the requested call type.
  void openContactForCall(request.handle, request.video);
});
```

```dart
final subscription = Callx.callRequests.listen((request) {
  openContactForCall(request.handle, request.video);
});
```

Android missed-call notifications offer **Call back** for unanswered/caller-cancelled incoming
calls. The action launches the app and delivers a request; it does not silently place a call.
Set `CallStylePresenter(missedCalls: false)` to opt out. Notifications require the host's notification
permission on Android 13+; permission denial does not prevent the call from ending.

On iOS, forward `NSUserActivity` from Recents/contact cards to `CallxCallRequests.handle`.
The Expo bootstrap plugin adds an AppDelegate hook, and Flutter registers application and scene delegates. Standard `FlutterSceneDelegate` hosts
forward these activities automatically, including a scene’s initial connection options.
For native/React Native scene hosts or a custom scene delegate that does not forward to Flutter, forward both `scene(_:continue:)` and the initial connection's
`connectionOptions.userActivities` in your own SceneDelegate:

```swift
for activity in connectionOptions.userActivities {
    CallxCallRequests.handle(activity)
}
// In scene(_:continue:):
CallxCallRequests.handle(userActivity)
```

Native hosts and React Native apps without the Expo bootstrap plugin must also forward
`application(_:continue:restorationHandler:)`, preserving the host's other activity handlers.
Answered calls are donated as system interactions by default; set `config.donateCalls = false`
to disable donation.

Siri voice calling is optional: enable the Siri capability, add `INStartCallIntent` to
`INIntentsSupported`, and return `CallxStartCallIntentHandler()` for that intent from
`application(_:handlerFor:)`. Callx only resolves contacts carrying a handle; the host still
validates the request before starting a call. This Siri flow and Recents launch have **not been
accepted on a physical iPhone**. See [Apple's intent handler guidance](https://developer.apple.com/documentation/intents/instartcallintenthandling).

## Migration from 0.2.4

Upgrade the core and provider adapter packages together to 0.3.0, reinstall native dependencies,
and rebuild. Native cores continue accepting 0.1.0 and 0.2.0 command envelopes; new wrappers send
0.3.0 and require the matching native core. Custom TypeScript backends must add the `dtmf` boolean
capability (`false` when unavailable). New route fields are optional on the wire. Existing camera,
call lifecycle and PiP APIs keep their signatures.

Custom Swift/Kotlin executors and Dart/TypeScript backends with exhaustive command switches
must handle the three added command cases (or return `unsupported` for features they do not
implement). Adding enum/union members can require source changes even though existing public
method signatures remain compatible.
