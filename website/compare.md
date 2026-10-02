---
title: "Compare"
description: "How Callx compares with react-native-callkeep, expo-callkit-telecom, flutter_callkit_incoming, vendor SDKs and writing native code yourself, and when to choose each."
---

# Compare

<p class="lead">
There are good libraries for calls in Flutter and React Native, and Callx learned from all of
them. This page compares them as fairly as we can, including where the others are the better
choice.
</p>

::: info Checked on 2026-10-01
Versions and features below come from each project's README, source and registry entry on that
date. Projects change; if something here is out of date or unfair,
[open an issue](https://github.com/bear-block/callx/issues/new) or edit this page and we will
fix it.
:::

## The options

| | Frameworks | Latest version (date) | License |
|---|---|---|---|
| **Callx** | Flutter, React Native, Expo | 0.1.3 | MIT |
| [react-native-callkeep](https://github.com/react-native-webrtc/react-native-callkeep) | React Native | 4.3.16 (2024-11) | ISC / MIT |
| [expo-callkit-telecom](https://github.com/mfairley/expo-callkit-telecom) | Expo modules | 0.5.0 (2026-09) | MIT |
| [flutter_callkit_incoming](https://github.com/hiennguyen92/flutter_callkit_incoming) | Flutter | 3.1.6 (2026-09) | MIT |
| [connectycube_flutter_call_kit](https://github.com/ConnectyCube/connectycube-flutter-call-kit) | Flutter | 2.8.2 (2025-10) | See repository |
| Vendor SDKs: [Twilio Voice](https://github.com/twilio/twilio-voice-react-native), [Stream Video](https://github.com/GetStream/stream-video-js) | Per vendor | Active | Vendor terms |
| Writing CallKit and Telecom code yourself | Any | | Yours |

## Feature comparison

<span class="ok">●</span> built in · <span class="part">◐</span> partly, or with your own native
code · <span class="no">○</span> not provided · – not documented (tell us if it exists)

| | Callx | callkeep | expo-callkit-telecom | flutter_callkit_incoming |
|---|---|---|---|---|
| Flutter **and** React Native from one core | <span class="ok">●</span> | <span class="no">○</span> | <span class="no">○</span> | <span class="no">○</span> |
| Receives VoIP push natively (iOS) | <span class="ok">●</span> | <span class="part">◐</span> separate library + AppDelegate code | <span class="ok">●</span> | <span class="part">◐</span> AppDelegate code |
| Receives FCM natively, no headless JS or Dart isolate (Android) | <span class="ok">●</span> | <span class="no">○</span> | <span class="ok">●</span> | <span class="part">◐</span> |
| Android Jetpack Core-Telecom | <span class="ok">●</span> | <span class="no">○</span> ConnectionService | <span class="ok">●</span> | <span class="part">◐</span> self-managed Telecom service |
| Call state owned natively, durable across process death | <span class="ok">●</span> | <span class="no">○</span> | <span class="part">◐</span> event queue | <span class="part">◐</span> replay cache |
| Replay of missed events with a snapshot | <span class="ok">●</span> | <span class="part">◐</span> initial events | <span class="part">◐</span> event queue | <span class="part">◐</span> `activeCalls()` |
| Idempotent commands with explicit results | <span class="ok">●</span> | <span class="no">○</span> | <span class="no">○</span> | <span class="no">○</span> |
| Cancelled calls can never ring again (tombstones) | <span class="ok">●</span> | <span class="no">○</span> | – | – |
| Media adapters (install = integration) | <span class="ok">●</span> LiveKit | <span class="no">○</span> | <span class="no">○</span> | <span class="no">○</span> |
| Expo config plugin | <span class="ok">●</span> | – | <span class="ok">●</span> | n/a |
| Bare React Native | <span class="ok">●</span> | <span class="ok">●</span> | <span class="no">○</span> Expo modules | n/a |
| Native Android incoming screen | <span class="ok">●</span> | <span class="part">◐</span> system UI in phone-account mode | <span class="ok">●</span> | <span class="ok">●</span> highly customizable |
| Video calls in the system UI | <span class="no">○</span> roadmap | <span class="ok">●</span> | <span class="ok">●</span> | <span class="ok">●</span> |
| DTMF | <span class="no">○</span> roadmap | <span class="ok">●</span> | <span class="ok">●</span> | <span class="part">◐</span> event only |
| Multiple simultaneous calls | <span class="no">○</span> roadmap | <span class="ok">●</span> | – | – |
| Siri and Recents call intents (iOS) | <span class="no">○</span> | <span class="part">◐</span> start-call action | <span class="ok">●</span> | – |
| Shared contract and conformance fixtures | <span class="ok">●</span> | <span class="no">○</span> | <span class="no">○</span> | <span class="no">○</span> |

## How they differ in approach

### react-native-callkeep

The long-standing standard for React Native. It exposes CallKit and ConnectionService to
JavaScript: your JavaScript displays calls and receives actions. VoIP pushes need
`react-native-voip-push-notification` and native code to report them in time. It has the largest
community and the most real-world mileage, plus multi-call and DTMF.

Its issue tracker shows what the JavaScript-owned approach costs: answer and end state getting
out of sync, actions lost while the app was killed, and watchdog terminations when the report
waits on JavaScript. Our review of its 570 issues shaped Callx's design.

**Choose it** if you need multi-call or DTMF today, already run it successfully, or need its
ConnectionService phone-account mode.

### expo-callkit-telecom

A modern Expo module with the same core insight as Callx: parse pushes natively and report calls
before JavaScript loads, on CallKit and Core-Telecom. It is actively maintained, and it already
supports video, DTMF and Siri intents.

**Choose it** if you build only with Expo, need video in the system UI or DTMF now, and do not
need Flutter or durable command results.

### flutter_callkit_incoming

The most popular Flutter option, with a rich, highly customizable Android incoming screen and a
broad feature set (video, hold, mute, missed-call notifications). On iOS, your AppDelegate
receives the VoIP push and hands it over; on Android, push handling goes through your Dart
messaging setup.

**Choose it** if you need deep visual customization of the Android incoming screen, or features
Callx does not have yet, and are comfortable owning the push path.

### Vendor SDKs (Twilio Voice, Stream Video and others)

Turnkey services: hosted signaling, push, media, phone numbers and dashboards, with their own
CallKit and Telecom integration. You pay per minute or per user and follow the vendor's model.

**Choose one** if you want a hosted service and its features (PSTN, recording, moderation) more
than control. Callx can still own the phone side for media-only vendors, and for signaling
vendors through [provider-managed mode](/guides/provider-managed).

### Writing it yourself

CallKit, PushKit and Core-Telecom are documented and free. Teams with strong native engineers
can build exactly what they need. Expect to handle the reporting rule, cold starts, duplicate and
late pushes, audio session ownership, lock-screen behaviour, vendor ROMs, and the same work again
for the other platform and framework.

**Choose it** if calling is your core product and you have the native team to maintain it.

## When Callx is the right choice

- You ship **Flutter or React Native, or both**, and want identical call behaviour.
- **Correctness matters more than features**: no lost answers, no ghost calls, no ringing after
  cancel, state you can trust after a crash.
- You want **your own backend and media**, with no vendor in the call path and no telemetry.
- You want to **avoid native code**: Expo needs none; bare apps need a few lines.

## When it is not (yet)

- You need **DTMF or multiple calls** today. See the [roadmap](/project/roadmap).
- You need **video from a published package** today: native video is implemented on the
  development branch and is still unreleased. See [video](/guide/video) and [status](/project/status).
- You need a **hosted service** rather than a library.
- You need **verified behaviour on a specific device family** that the
  [status page](/project/status) does not list yet. Test it, or help us test it.
