---
layout: home
title: "Callx"
titleTemplate: "Native calls for Flutter and React Native"

hero:
  name: Callx
  text: Native calls. Your app’s experience.
  tagline: Incoming calls, native audio and video, optional call screens and Android PiP for Flutter and React Native. One shared native core. Your backend, your branding.
  image:
    src: /logo.svg
    alt: Callx
  actions:
    - theme: brand
      text: Get started
      link: /guide/setup
    - theme: alt
      text: Explore features
      link: /guide/features
    - theme: alt
      text: View on GitHub
      link: https://github.com/bear-block/callx

features:
  - icon: 📲
    title: Native owns the call
    details: The push is received, the call reported to CallKit or Telecom, and every answer and hang-up recorded natively, before Dart or JavaScript starts. Your UI observes the recorded result when its runtime starts; delivery and recovery limits are documented.
  - icon: 🧭
    title: Voice and video, natively
    details: Install the optional LiveKit adapter for native media, camera commands and video surfaces, or connect your own media. Android video has emulator evidence; iOS video acceptance is pending.
  - icon: ♻️
    title: Recovery built in
    details: A durable journal, idempotent commands and replayable events. After a crash, a reload or a reboot, your UI catches up from a snapshot instead of guessing.
  - icon: 🔌
    title: Bring your own everything
    details: No required Callx hosted service or media vendor. Android FCM integration needs Firebase configuration. Use your backend and media engine, or install an adapter such as LiveKit and write no native code.
  - icon: 🔕
    title: Your screens, with continuation
    details: Build your own UI or customize the supplied call overlay and mini-call. Android system PiP keeps a compact call visible outside the app. Native still owns the call state.
  - icon: 🛡️
    title: Private by default
    details: MIT licensed. No Callx telemetry endpoint. Persisted media configuration uses Android Keystore and iOS keychain; your app chooses its backend and media provider.
---

<div class="vp-doc" style="max-width: 1152px; margin: 64px auto 0; padding: 0 24px;">

::: info Release and development
Version **0.2.3** is published on npm and pub.dev, with contract 0.2.0, native video, Android PiP
and optional call overlays. This release adds customizable controls, foreground-aware auto-hide
and native Android locked-call controls. Read the [release notes](/project/changelog#release-0-2-3)
and [upgrade guide](/guide/upgrade-0-2-3). See [status](/project/status) for what has been verified.
:::

<CallFeatureGallery />

<CallDemoShowcase />

## Start with your app

<div class="start-paths">

<a href="/callx/guide/flutter"><strong>Flutter</strong><span>Native calls, Dart API and optional call overlay →</span></a>
<a href="/callx/guide/react-native"><strong>React Native</strong><span>Native calls, TypeScript API and optional call overlay →</span></a>
<a href="/callx/guide/expo"><strong>Expo</strong><span>Config plugin and development build setup →</span></a>

</div>

## The same call, in either framework

::: code-group

```ts [React Native]
import {Callx} from '@bear-block/callx';

const callx = new Callx();
await callx.setup();

// Incoming calls ring natively. Your UI follows the native state.
callx.observe(({call}) => render(call));

// Answer from your own screen; CallKit and Telecom stay in sync.
await callx.answer(callId);
```

```dart [Flutter]
import 'package:callx/callx.dart';

final callx = Callx();
await callx.setup();

// Incoming calls ring natively. Your UI follows the native state.
callx.snapshots.listen((snapshot) => render(snapshot.call));

// Answer from your own screen; CallKit and Telecom stay in sync.
await callx.answer(callId);
```

:::

## Packages

| Package | Flutter (pub.dev) | React Native (npm) |
|---|---|---|
| Core: CallKit and Telecom, push ingress, incoming UI, recovery | [`callx`](https://pub.dev/packages/callx) | [`@bear-block/callx`](https://www.npmjs.com/package/@bear-block/callx) |
| LiveKit audio/video adapter (optional) | [`callx_livekit`](https://pub.dev/packages/callx_livekit) | [`@bear-block/callx-livekit`](https://www.npmjs.com/package/@bear-block/callx-livekit) |
| Device-trial tools: call console, test pushes, conformance | | [`@bear-block/callx-testkit`](https://www.npmjs.com/package/@bear-block/callx-testkit) |

## Choose your call UI

Keep your own Dart or TypeScript screens, or use the [call overlay and mini-call components](/guide/call-ui) with your colors, logo and controls.
Native code owns the call lifecycle in either case. Android system PiP keeps a compact
video or branded layout visible when leaving the app; iOS system PiP is not implemented.
A unified configuration for native, custom and supplied UI is [planned](/project/roadmap).

## Provider adapters

| Provider | Status | Scope |
|---|---|---|
| [LiveKit](/guide/livekit) | **Audio and video in 0.2.2** | Native media adapter for Flutter and React Native |
| Twilio Video / Programmable Voice | **Planned next** | Media adapter and a separate provider-managed signaling adapter |
| Zoom Video SDK | **Planned** | Audio/video media adapter |
| Agora | **Planned** | Audio/video media adapter |

Only LiveKit has a Callx adapter today. Planned adapters have no installable Callx package
or release date. See the [provider roadmap](/project/roadmap#providers-in-order) for dependencies
and the providers queued by demand.

## What Callx is not

Callx is a library, not a calling service. It does not host signaling, send pushes or relay
media. You keep your backend and your media provider; Callx makes the phone side of the call
correct. [Read why that boundary matters →](/why#what-callx-does-not-do)

<SponsorList :tiers="['partner', 'company']" heading="Sponsors" hide-when-empty />

<p style="margin-top: 48px; text-align: center;">
  Callx is independent open source. <a href="/callx/sponsor">Sponsoring it</a> keeps it maintained through every iOS and Android release.
  Need calls in your app? <a href="/callx/services">Work with us</a>.
</p>

</div>
