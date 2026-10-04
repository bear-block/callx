---
title: "FAQ"
description: "Common questions about Callx's scope, platforms, pricing, privacy and compatibility."
---

# FAQ

## General

### Is Callx free?

Yes. Callx is MIT licensed, with no paid tier inside the library and no feature locked behind a
license key. It is funded by [sponsors](/sponsor).

### Does Callx send any data anywhere?

No. The library has no telemetry, not even opt-in, and makes no network requests of its own.
The LiveKit adapter calls only the token URL you configure. This website has no analytics either.

### Do I need a Callx server or account?

No. You use your own backend and push credentials. There is no Callx service between your users.

### Does Callx carry audio or video?

No. It coordinates the media engine you choose: install the [LiveKit adapter](/guide/livekit) or
[bring your own](/guides/own-media). Callx includes native [video calls](/guide/video) and LiveKit video for Flutter and
React Native, plus picture-in-picture (experimental on iOS). Verification differs by platform; see [status](/project/status).

### Can I use Callx with Twilio, Agora, Stream, Daily…?

For media-only providers (Agora, Twilio Video, Daily, Vonage Video, 100ms…), connect them from
the native callbacks today, or write an adapter. For providers that own signaling (Twilio Voice,
Vonage Voice, Telnyx), see [provider-managed signaling](/guides/provider-managed).

## Platforms

### Which versions are supported?

iOS 15+, Android 10 (API 29)+, Flutter 3.41+, React Native 0.76+ (New and legacy architecture),
Expo SDK 57 with a development build. See [get started](/guide/#requirements).

### Why Android 10 and not older?

It is a scope choice, not a platform limit: Core-Telecom itself supports API 26. Starting at 29
keeps the matrix Callx must test on real devices (legacy ConnectionService below 34,
transactional calls from 34) small enough to test properly. It can be lowered if users need it
and testing is funded.

### Does it work in Expo Go?

No. Callx contains native code. Use a development build; the [Expo plugin](/guide/expo) needs no
native code from you.

### Does it work on web?

Only the simulator. Browsers have no CallKit or Telecom equivalent.

### What about mainland China?

Apple requires apps sold in China to disable CallKit, and Google services (FCM) are unavailable
there. Callx does not cover those markets in this version.

### Can I receive calls on an iPad or an Android tablet?

iPad: yes, CallKit works on iPadOS. Android tablets: only those that implement Telecom; others
report `nativeCalling: false`.

## Behaviour

### Why does my call stay "connecting" after answering?

Answered is not connected. The call becomes `active` when media reports that audio flows. If it
stays `connecting`, media never started or never reported. See
[troubleshooting](/guides/troubleshooting#answered-but-no-audio).

### Can a phone ring for a call that was already cancelled?

Not with Callx. The core keeps a ledger of ended calls, and a cancel that arrives before its
invitation is recorded, so the late invitation never rings.

### How many calls at once?

One live call in this version. An invitation during a call is reported as busy to your listener.
Multi-call is on the [roadmap](/project/roadmap).

### Can I customize the incoming-call screen?

On iOS the screen is CallKit's; you choose the app icon, ringtone and Recents behaviour through
`CXProviderConfiguration`. On Android, use Callx's native screen or provide your own Activity.

## Project

### Is Callx production ready?

See the [status page](/project/status). It lists what is verified, on which devices, and what
still needs testing.

### Who maintains Callx?

Callx is an independent open-source project. See [contributing](/project/contributing) and
[sponsor](/sponsor).
