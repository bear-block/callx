---
title: "Status"
description: "What has been verified, how, and on which devices. Updated as device trials pass."
sponsorPrompt: verify
---

# Status

<p class="lead">
The single source of truth for what has been verified. The rest of the site describes how
Callx is designed to behave; this page says where that has been proven, and where it has not.
</p>

**Last updated:** 2026-10-04 · **Packages:** `3.0.0` · **Contract:** `0.3.0`

::: warning Not verified yet
No physical phone has run a Callx call yet: no iPhone, no Android vendor ROM, no Bluetooth or
car audio. iOS has been checked in the Simulator only, which cannot receive VoIP pushes or keep
a CallKit call. Everything below marked on emulators is real OS integration, not device
acceptance. [Help verify](#help-verify).
:::

## Latest release

Package version **3.0.0** uses contract **0.3.0**. It adds
[audio routes, DTMF, caller name updates and system call requests](/guide/phone-features).
Native automated tests cover mappings and command behavior; physical
Bluetooth, iOS Recents/Siri and remote SIP/IVR acceptance remain pending.

## At a glance

<span class="ok">●</span> verified · <span class="part">◐</span> partly verified ·
<span class="no">○</span> not yet verified

| Feature | Automated | Emulator / Simulator | Physical device |
|---|---|---|---|
| **Core** | | | |
| Contract and result mapping (Swift, Kotlin, Dart, TypeScript) | <span class="ok">●</span> | <span class="ok">●</span> | n/a |
| Durable journal, replay, operation lookup | <span class="ok">●</span> | <span class="ok">●</span> | <span class="no">○</span> |
| Adapter discovery (Flutter and React Native) | <span class="ok">●</span> | <span class="ok">●</span> | <span class="no">○</span> |
| **Android** | | | |
| FCM invitation rings through Telecom (API 29–36) | <span class="ok">●</span> | <span class="ok">●</span> | <span class="no">○</span> |
| Answer from the notification and the secure lock screen | <span class="ok">●</span> | <span class="ok">●</span> | <span class="no">○</span> |
| Ringtone, volume-down silence, cancel, ring deadline | <span class="ok">●</span> | <span class="ok">●</span> | <span class="no">○</span> |
| Recovery after process death | <span class="ok">●</span> | <span class="ok">●</span> | <span class="no">○</span> |
| Vendor ROMs (Xiaomi, Samsung, Oppo…) | n/a | n/a | <span class="no">○</span> |
| **iOS** | | | |
| VoIP push reported to CallKit, `mustReport` handling | <span class="ok">●</span> | <span class="part">◐</span> | <span class="no">○</span> |
| CallKit actions and audio activation | <span class="ok">●</span> | <span class="part">◐</span> | <span class="no">○</span> |
| Lock-screen answer | n/a | n/a | <span class="no">○</span> |
| **Media and video** | | | |
| LiveKit audio: two-way, interruption, recovery (Android) | <span class="ok">●</span> | <span class="ok">●</span> | <span class="no">○</span> |
| LiveKit audio inside the CallKit window (iOS) | <span class="ok">●</span> | <span class="part">◐</span> | <span class="no">○</span> |
| Video calls on Android: video both ways, `CallxVideoView`, camera commands, background pause | <span class="ok">●</span> | <span class="ok">●</span> | <span class="no">○</span> |
| Video calls on iOS | <span class="ok">●</span> | <span class="no">○</span> | <span class="no">○</span> |
| Bluetooth and route changes | n/a | n/a | <span class="no">○</span> |
| **Picture-in-picture and UI** | | | |
| Android PiP: manual and automatic entry, compact layout, camera continuity, end cleanup | <span class="ok">●</span> | <span class="ok">●</span> | <span class="no">○</span> |
| iOS PiP (experimental) | <span class="ok">●</span> | <span class="no">○</span> Simulator unsupported | <span class="no">○</span> |
| Call overlay and mini-call: Back minimizes, expand returns to the same call | <span class="ok">●</span> | <span class="ok">●</span> | <span class="no">○</span> |
| **Frameworks** | | | |
| Expo managed: no native code, FCM through the generated service | <span class="ok">●</span> | <span class="ok">●</span> | <span class="no">○</span> |
| React Native New Architecture (TurboModule, Fabric view) | <span class="ok">●</span> | <span class="ok">●</span> | <span class="no">○</span> |
| iPhone ↔ Android call through one backend | n/a | n/a | <span class="no">○</span> |

iOS Simulator rows are partial: the Simulator proves builds, discovery and API wiring, not a
ringing call.

### How we verify

| Level | What it proves | Where it runs |
|---|---|---|
| **Automated** | Logic, contract fixtures, result mapping, recovery, Swift and Kotlin parity | Every commit: Swift, Kotlin, Dart and TypeScript suites |
| **Emulator / Simulator** | Integration with the real OS frameworks: Telecom, notifications, CallKit APIs, Expo builds | Android emulator, iOS Simulator |
| **Physical device** | Push delivery, the lock screen, real audio, vendor ROMs, Bluetooth | Real iPhones and Android phones |

A behaviour counts as verified on a level only with a dated record below. A simulator run never
counts as a device pass.

<SponsorCallout reason="verify" />

## Known issues

| Issue | Status |
|---|---|
| WebRTC crash (`SIGSEGV`) in the LiveKit SDK on an API 34 emulator with the microphone granted | Under investigation; to be reproduced or ruled out on a physical device |
| Calls before the first unlock after a reboot are missed | Platform limit today; direct-boot support is on the [roadmap](/project/roadmap) |
| Below Android 14, Telecom records video calls as audio | Core-Telecom limit; video itself works. See [video calls](/guide/video#platform-notes) |
| The Android emulator exposes the speaker only | Earpiece and Bluetooth switching remain unverified |

## Evidence

Newest first. Each record names the build, the platform and the date.

### iOS Simulator and 0.2.4 release checks — 2026-10-04 {#ios-simulator-2026-10-04}

- The native iOS Simulator suites (core and LiveKit) passed, including the new PiP lifecycle,
  call-observer and renderer tests. Both example apps built for the Simulator.
- iOS PiP: on iPhone 18 Pro / iOS 27 Simulator, `isPictureInPictureSupported()` is false and
  manual entry returns false as designed. This is **not** evidence of a working PiP window.
  See [iOS PiP setup](/guide/video#picture-in-picture-on-ios).
- Earlier the same day the core suite passed 92 tests, and both examples showed their Home
  screens on iPhone 17 / iOS 26.5 Simulator with correct safe areas.
- All packages passed version checks and npm/pub packaging dry runs before 0.2.3 and 0.2.4 were
  published; clean consumer installs verified 0.2.3 on both registries.

### Two-device call — 2026-10-02 {#two-device-call}

React Native on Android API 36 called Flutter on API 33 through real FCM and native LiveKit.
The recorded trial passed 25 checks: remote video on both hosts, camera switching, in-app
minimize and expand, Android PiP, camera-off branding and remote-end cleanup.
[Watch the demo](/guide/demos).

### Video calls with a secure lock screen — 2026-10-02 {#secure-lock-screen}

Flutter (debug) and React Native (release) passed 14 checks each on Android 16 / API 36 with a
temporary secure PIN; a later warm-process React Native trial passed 46 checks on a
development build. [Watch the demo](/guide/lockscreen-demo).

- A real FCM video invitation rang with the screen off; Decline ended the call.
- Answer connected audio before the PIN was entered; the camera did not start by itself.
- After unlocking, remote video arrived, and the caller received local video once the camera
  was turned on. Locking paused the camera and unlocking resumed it.

These cover the default `RequireUnlock` policy on API 36 only.

### Android video conformance — 2026-10-02 {#android-video-conformance}

`npm run conformance:matrix -- --video`: a video invitation, video in both directions, video
moving in `CallxVideoView`, switching camera, and the camera pausing in the background.

| Android | API | Result |
|---|---|---|
| 13 | 33 | 15/15 (Telecom's video registration needs API 34) |
| 16 | 36 | 16/16 |

### Android picture-in-picture — 2026-10-02 {#android-pip}

Local signaling UI trials with `tool/pip-smoke.mjs`: video both ways, manual PiP with moving
frames, camera continuing in PiP, pausing when PiP closes, branded fallback when both cameras
are off, and automatic entry disabled after the call ends.

| Example | Android / API | Result |
|---|---|---|
| Flutter debug, RN release | 16 / 36 | Manual and automatic entry, dismiss and resume, video and fallback, end cleanup |
| Flutter debug, RN release | 11 / 30 | Manual entry, dismiss and resume, video and fallback, end cleanup |
| RN release | 10 / 29 | Manual entry, video and fallback, end cleanup |

Automatic entry correctly stays disabled below API 31. The call overlay and mini-call were
checked on API 36 for both frameworks.

### Android audio conformance — 2026-10-01 {#android-emulator-matrix}

`npm run conformance:matrix`: a real FCM invitation, ringing through Telecom, answer from the
notification, media connected, interruption and recovery, remote end, and no crash.

| Android | API | Result |
|---|---|---|
| 10 | 29 | 8/8 |
| 12 | 31 | 8/8 |
| 13 | 33 | 8/8 |
| 16 | 36 | 8/8 |

The first run found that calls did not ring below Android 13; fixed in 0.1.3.

## Help verify

The fastest way to close the gaps above is results from phones people already own.

| Platform | Needed | Why emulators cannot stand in |
|---|---|---|
| iOS | Results from iPhones on iOS 15 or later | The Simulator neither receives VoIP pushes nor keeps CallKit calls |
| Android | Results from Samsung and Xiaomi phones first | Vendor battery managers, Bluetooth and real audio paths exist only on hardware |

- Run the [acceptance checklist](/guides/testing#acceptance-checklist) on your phone and
  [share the results](https://github.com/bear-block/callx/issues/new?template=device-results.yml).
  They are listed here with credit.
- Pass on a phone you no longer use: see [help verify on real devices](/sponsor#help-verify-on-real-devices).
- [Sponsor](/sponsor) the maintainer time that turns results into fixes and releases.
