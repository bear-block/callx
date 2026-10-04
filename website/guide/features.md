---
title: "What you can build"
description: "Callx capabilities, optional UI, native media and platform coverage, with demos and released versus development status."
---

# What you can build

Callx connects native incoming calls, reliable call state, native media integration and optional
call UI for Flutter and React Native. Use the layers you need: your app keeps its navigation,
backend and visual identity.

<CallFeatureGallery />

## Choose the pieces for your app

| Layer | Available today | Where to start |
|---|---|---|
| Native call core | CallKit/PushKit on iOS, self-managed Core-Telecom and incoming presentation on Android; commands, durable journal, replay and recovery | [Architecture](/concepts/architecture) |
| Media | Optional native LiveKit audio/video adapter, native video views, mute and camera commands; bring your own media through the adapter interface | [LiveKit](/guide/livekit) · [Own media](/guides/own-media) |
| App presentation | Your Dart/TypeScript UI, or supplied call screen, root overlay and in-app mini-call with colors, logo and custom controls | [Call UI](/guide/call-ui) |
| Android continuation | System PiP with video or branded fallback, separate from the mini-call inside your app | [Video and PiP](/guide/video) |
| Integration tools | Setup/code generator, example apps, local call console, test pushes and adapter conformance | [Setup](/guide/setup) · [First call](/guide/first-call) |

The native coordinator remains the single call-state owner. Presentation observes snapshots;
an adapter joins media. Adding a UI component does not create another calling engine.

## Match your platform

| Capability | Android | iOS |
|---|---|---|
| Native incoming/reporting and typed call lifecycle | Implemented; automated and emulator checks | Implemented; automated and Simulator checks |
| LiveKit audio/video | Implemented; Android video emulator trials | Implemented; physical-device audio/video acceptance pending |
| Framework overlay and in-app mini-call | Available | Available; platform acceptance still needed |
| System picture-in-picture | Available; automatic entry needs Android 12+ | Experimental, iOS 15+; not yet tried on an iPhone |
| Persistent native locked-call timer, mute, hold and audio controls | Available; RN API 36 secure-PIN demo | CallKit owns system presentation; this Android screen is not an iOS feature |

These are implementation and verification levels, not physical-device guarantees.
[Status](/project/status) lists the tested builds and remaining device checks.

## What is next

Twilio, Zoom Video SDK and Agora adapters are [planned](/project/roadmap#providers-in-order).
Standalone Kotlin/Swift SDKs are in development; a hosted Callx backend is a future direction.
Only LiveKit currently has an installable Callx media adapter. Unified native/custom/supplied
UI configuration is also planned; use the supported customization surfaces today.

## See the flows, then set up yours

- [Steven calls hao.dev7](/guide/demos): real FCM and LiveKit between React Native and Flutter,
  with camera controls, mini-call and Android PiP.
- [Secure lock-screen incoming](/guide/lockscreen-demo): voice/video answer, timer, native
  controls, unlock and camera continuation on an Android emulator.
- [Personalize your setup](/guide/setup): choose framework, platform, UI, media and backend;
  copy Dart or TypeScript starter code and follow the integration checklist.

Callx currently manages one live call. Conference merging, DTMF and a hosted signaling service
remain outside the shipped scope. Your backend creates calls, sends pushes and arbitrates
answers across devices.
