---
layout: home
title: "Callx"
titleTemplate: "Native calls for Flutter and React Native"

hero:
  name: Callx
  text: Native calls. Your app’s experience.
  tagline: Incoming and outgoing calls, native audio and video, picture-in-picture and optional call screens for Flutter and React Native, on one shared native core. Your backend, your branding.
  # The hero shows the recorded call (HeroDemo); VitePress needs an image entry to render that slot.
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
  - icon: '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/></svg>'
    title: Native owns the call
    details: Pushes are received, reported to CallKit or Telecom, and every answer recorded natively, even before Dart or JavaScript starts.
  - icon: '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="13" height="12" rx="2"/><path d="m16 10 5-3v10l-5-3"/></svg>'
    title: Voice and video
    details: Native media with the LiveKit adapter, camera commands and one video view, or bring your own media engine.
  - icon: '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>'
    title: Recovery built in
    details: A durable journal and idempotent commands. After a crash, a reload or a reboot, your UI catches up from a snapshot.
  - icon: '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 7V3M15 7V3"/><path d="M6 7h12v4a6 6 0 0 1-12 0z"/><path d="M12 17v4"/></svg>'
    title: Bring your own everything
    details: No Callx service in between. Use your backend and media, or install an adapter and write no native code.
  - icon: '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="14" rx="2"/><rect x="12" y="10" width="7" height="6" rx="1"/></svg>'
    title: Your screens, with continuation
    details: Build your own UI or customize the supplied call overlay, mini-call and picture-in-picture.
  - icon: '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/></svg>'
    title: Private by default
    details: MIT licensed, no telemetry. Credentials stay in the Keystore and keychain; you choose the backend and provider.
---

<div class="vp-doc" style="max-width: 1152px; margin: 64px auto 0; padding: 0 24px;">

<CallDemoShowcase demo="lockscreen" />

<CallFeatureGallery />

::: info Latest release: 3.0.1
Backend events from Dart and JavaScript, cancel pushes that stop a ringing Android call, and a
fixed missed-call Call back. 3.0.0 added audio routes, DTMF, caller-name updates and call back.
[Release notes](/project/changelog#release-3-0-1) · [What has been verified](/project/status)
:::

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
Native code owns the call lifecycle in either case. Picture-in-picture keeps a compact video or
branded layout visible when the user leaves the app (experimental on iOS).
A unified configuration for native, custom and supplied UI is [planned](/project/roadmap).

## Provider adapters

| Provider | Status | Scope |
|---|---|---|
| [LiveKit](/guide/livekit) | **Available: audio and video** | Native media adapter for Flutter and React Native |
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
