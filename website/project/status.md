---
title: "Status"
description: "What has been verified, how, and on which devices. Updated as device trials pass."
sponsorPrompt: devices
---

# Status

<p class="lead">
This page is the single source of truth for what has been verified. The rest of the site
describes how Callx is designed to behave; this page says where that behaviour has been proven,
and where it has not been yet.
</p>

**Last updated:** 2026-10-01 · **Packages:** `0.1.0` · **Contract:** `0.1.0`

## How we verify

| Level | What it proves | Where it runs |
|---|---|---|
| **Automated** | Logic, contract fixtures, result mapping, recovery, parity between Swift and Kotlin | Every commit in CI: Swift, Kotlin, Dart and TypeScript suites |
| **Emulator / Simulator** | Integration with the real OS frameworks: Telecom, notifications, CallKit APIs, Expo builds | Android emulator, iOS Simulator |
| **Physical device** | Push delivery, the lock screen, real audio, vendor ROMs, Bluetooth | Real iPhones and Android phones |

A behaviour counts as verified on a level only with a dated record. A simulator run never counts
as a device pass.

## Feature status

<span class="ok">●</span> verified · <span class="part">◐</span> partly verified ·
<span class="no">○</span> not yet verified

| Feature | Automated | Emulator / Simulator | Physical device |
|---|---|---|---|
| Contract and result mapping (Swift, Kotlin, Dart, TS) | <span class="ok">●</span> | <span class="ok">●</span> | n/a |
| Durable journal, replay, operation lookup | <span class="ok">●</span> | <span class="ok">●</span> | <span class="no">○</span> |
| Android: FCM invitation rings through Telecom | <span class="ok">●</span> | <span class="ok">●</span> | <span class="no">○</span> |
| Android: answer from notification with the app locked | <span class="ok">●</span> | <span class="ok">●</span> | <span class="no">○</span> |
| Android: repeating ringtone, volume-down silence | <span class="ok">●</span> | <span class="ok">●</span> | <span class="no">○</span> |
| Android: cancel before invitation, ring deadline | <span class="ok">●</span> | <span class="ok">●</span> | <span class="no">○</span> |
| Android: recovery after process death | <span class="ok">●</span> | <span class="ok">●</span> | <span class="no">○</span> |
| Android: vendor ROMs (Xiaomi, Samsung, Oppo…) | n/a | n/a | <span class="no">○</span> |
| iOS: VoIP push reported to CallKit, `mustReport` handling | <span class="ok">●</span> | <span class="part">◐</span> | <span class="no">○</span> |
| iOS: CallKit actions and audio activation | <span class="ok">●</span> | <span class="part">◐</span> | <span class="no">○</span> |
| iOS: lock-screen answer | n/a | n/a | <span class="no">○</span> |
| LiveKit adapter: two-way audio, interruption, recovery (Android) | <span class="ok">●</span> | <span class="ok">●</span> | <span class="no">○</span> |
| LiveKit adapter: audio inside the CallKit window (iOS) | <span class="ok">●</span> | <span class="part">◐</span> | <span class="no">○</span> |
| Adapter discovery (Flutter and React Native) | <span class="ok">●</span> | <span class="ok">●</span> | <span class="no">○</span> |
| Expo managed: no native code, FCM through the generated service | <span class="ok">●</span> | <span class="ok">●</span> | <span class="no">○</span> |
| React Native New Architecture (TurboModule) | <span class="ok">●</span> | <span class="ok">●</span> | <span class="no">○</span> |
| Bluetooth and route changes | n/a | n/a | <span class="no">○</span> |
| iPhone ↔ Android call through one backend | n/a | n/a | <span class="no">○</span> |

iOS Simulator rows are partial because the Simulator cannot receive VoIP pushes and ends CallKit
calls immediately; it proves builds, discovery and API wiring, not a ringing call.

<SponsorCallout reason="devices" />

## Known issues

| Issue | Status |
|---|---|
| WebRTC crash (`SIGSEGV`) in the LiveKit SDK on an API 34 emulator with the microphone granted | Under investigation; to be reproduced or ruled out on a physical device |
| Calls before the first unlock after a reboot are missed | Platform limit today; direct-boot support is on the [roadmap](/project/roadmap) |

## Device trial plan

The device trials cover, among others: killed, background and foreground pushes on iOS; the lock
screen on both platforms; audible two-way audio; AirPods and Bluetooth; network switches during a
call; process death during a call; Xiaomi and Samsung battery managers; full-screen intents
denied on Android 14+; a 30-minute call; and account switches.

Results are published on this page, with the device, OS version and date of each run, as the
trials pass.

## Help verify

Device coverage is the most valuable contribution right now, and the most expensive part of
the project. You can help by:

- Running the [acceptance checklist](/guides/testing#acceptance-checklist) on your devices and
  [reporting results](https://github.com/bear-block/callx/issues/new).
- [Sponsoring](/sponsor) the device lab: every vendor phone we can test on is one less class of
  missed calls.
