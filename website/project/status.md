---
title: "Status"
description: "What has been verified, how, and on which devices. Updated as device trials pass."
sponsorPrompt: verify
---

# Status

<p class="lead">
This page is the single source of truth for what has been verified. The rest of the site
describes how Callx is designed to behave; this page says where that behaviour has been proven,
and where it has not been yet.
</p>

**Last updated:** 2026-10-04 · **Packages:** `0.2.3` · **Contract:** `0.2.0`

Version 0.2.2 includes native video, Android PiP and optional framework UI. The results below
describe the tested platforms and builds; publication does not establish physical-device
or iOS video acceptance.

Watch the [Steven → hao.dev7 two-device demo](/guide/demos): React Native on Android API 36
calls Flutter on API 33 through real FCM and native LiveKit. The recorded trial passed
25 checks, including remote video on both hosts, camera switching, in-app minimize/expand, Android system PiP,
camera-off branding and remote-end cleanup. Screen recording is silent; physical-device and
iOS acceptance remain separate gates.

The [secure lock-screen demo](/guide/lockscreen-demo) adds a warm-process RN trial with
46 passing checks on a **development build**: native voice/video invitations, locked timer,
mute/hold/Speaker controls, explicit camera activation after unlock, and camera pause/resume.
The updated unlock flow and native controls ship in 0.2.3; package 0.2.2 does not include them.
The emulator exposes Speaker only, so earpiece/Bluetooth switching remains unverified.
The source examples now separate Home and Diagnostics and use exported compact call controls.
Video controls auto-hide; app navigation uses a mini-call, and leaving the app uses automatic Android PiP.
The RN example measures safe-area insets; Android native incoming/locked UI handles system
bars and cutouts. An API 33 journal-pruning crash found during these trials is fixed in source.
These UI and runtime changes ship in **0.2.3**. See the [upgrade guide](/guide/upgrade-0-2-3).

The [setup guide](/guide/setup#generated-code) now generates copyable Dart or TypeScript
starter files and native configuration fragments for released integration choices.

On 2026-10-04, the native iOS Simulator suite passed **92 tests**. Both source examples built
and displayed their Home screens on iPhone 17 / iOS 26.5 Simulator, including safe-area layout
and the distinct demo identities. React Native required refreshing its generated CocoaPods
after adding the Safe Area dependency. This confirms example startup and native test behavior;
VoIP push, locked answering and real audio/video still need physical iPhone acceptance.
System PiP is currently Android-only; iOS uses CallKit's system incoming presentation.

## Release 0.2.3 verification

On 2026-10-04, all five packages published as stable 0.2.3. Registry metadata and clean
consumer installations verified the exact versions: three npm packages and both pub packages.
Flutter consumer analysis, ten quick-test groups, archive checks and website build passed.
This does not substitute for fresh remote CI or physical-device call acceptance.

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
| Flutter video calls on Android (LiveKit): ring as video, video both ways, `CallxVideoView`, camera commands, background pause | <span class="ok">●</span> | <span class="ok">●</span> | <span class="no">○</span> |
| Flutter Android PiP: manual and automatic entry, compact layout, camera continues, auto-entry disabled after end (API 36) | <span class="ok">●</span> | <span class="ok">●</span> | <span class="no">○</span> |
| RN Android PiP: manual and automatic entry, compact layout, camera continuity and call-end cleanup (API 36) | <span class="ok">●</span> | <span class="ok">●</span> | <span class="no">○</span> |
| Optional root call overlay / mini-call: Home until accept, Back minimizes, same call expands, terminal cleanup (Flutter/RN API 36) | <span class="ok">●</span> | <span class="ok">●</span> | <span class="no">○</span> |
| Flutter/RN video invitation with secure PIN lock: native answer/decline, audio before unlock, video after foreground, camera pause/resume (API 36) | <span class="part">◐</span> native lifecycle tests | <span class="ok">●</span> | <span class="no">○</span> |
| iOS PiP | Not implemented | n/a | n/a |
| Video calls (iOS) | <span class="ok">●</span> | <span class="no">○</span> | <span class="no">○</span> |
| Adapter discovery (Flutter and React Native) | <span class="ok">●</span> | <span class="ok">●</span> | <span class="no">○</span> |
| Expo managed: no native code, FCM through the generated service | <span class="ok">●</span> | <span class="ok">●</span> | <span class="no">○</span> |
| React Native New Architecture (TurboModule) | <span class="ok">●</span> | <span class="ok">●</span> | <span class="no">○</span> |
| Bluetooth and route changes | n/a | n/a | <span class="no">○</span> |
| iPhone ↔ Android call through one backend | n/a | n/a | <span class="no">○</span> |

iOS Simulator rows are partial because the Simulator cannot receive VoIP pushes and ends CallKit
calls immediately; it proves builds, discovery and API wiring, not a ringing call.

### Android emulator matrix

`npm run conformance:matrix` runs the LiveKit adapter conformance on each emulator in turn: a
real FCM invitation, ringing through Telecom, answer from the notification, media connected,
interruption and recovery, remote end, and no crash.

| Android | API | Result | Date |
|---|---|---|---|
| 10 | 29 | 8/8 | 2026-10-01 |
| 12 | 31 | 8/8 | 2026-10-01 |
| 13 | 33 | 8/8 | 2026-10-01 |
| 16 | 36 | 8/8 | 2026-10-01 |

The first run found that calls did not ring below Android 13; the fix is in the
[changelog](/project/changelog).

With `--video` the matrix runs the video conformance: a video invitation, the caller's camera
on the device and the device's camera at the caller, video moving in `CallxVideoView`,
switching camera, and the camera pausing in the background and resuming in front.

| Android | API | Video result | Date |
|---|---|---|---|
| 13 | 33 | 15/15 (Telecom's video registration needs API 34) | 2026-10-02 |
| 16 | 36 | 16/16 | 2026-10-02 |

### Video calls with a secure lock screen

On 2026-10-02, the Flutter debug and React Native release examples passed 14 checks each
on Android 16 / API 36 with a temporary secure PIN. The native incoming Activity appeared
while keyguard was showing, secure and occluded; this was not merely a screen-off trial.

- A real FCM video invitation rang while the screen was off; Decline ended the call.
- Answer connected LiveKit audio before entering the PIN; the camera did not auto-start.
- Unlocking and bringing the app foreground opened the call overlay. Remote video arrived,
  and the caller subscribed to local video after explicitly enabling the camera.
- Locking the active call paused the camera; unlocking and returning resumed it.
- Ending the call removed the overlay. The temporary PIN was removed after the trial.

These checks cover the default `RequireUnlock` policy on API 36. `ShowOverLockScreen`, other
Android versions, iOS, physical devices and acoustic audio quality remain outside this trial.

### Release readiness

Local verification on 2026-10-02 passed all 10 quick-test groups, 157 native Android tests
(including build variants), 92 core iOS Simulator tests, package version consistency, and
npm/pub packaging dry runs. LiveKit iOS Simulator tests also passed locally, with one
expected entitlement limitation in the test environment.

Version 0.2.2 was published following local checks with CI verification of the final source
and physical-device acceptance still pending. These remain verification gaps; package
availability does not establish support on untested devices.

### Android PiP smoke test

On 2026-10-02 both development examples with LiveKit passed a separate UI trial on Android 16
(API 36). The RN example used a release APK; Flutter used a debug APK. Checks covered:

- A local video invitation answered from the notification, with video in both directions.
- Manual PiP with changing video frames, app controls hidden and camera continuing.
- Closing PiP pauses the camera; returning to the app resumes it.
- Remote video → local-only video → the app background and logo when both cameras are off.
- Automatic entry on Home and automatic entry disabled after ending the call, with no crash.

The examples now separate the call overlay from diagnostics, with the local preview at the top
right. The root overlay/mini-call continuation passed Android 16 trials for both frameworks:
incoming stays on Home, notification accept opens the overlay, Back shows a live mini-call,
and expanding it does not answer again or pause the camera. These are local signaling UI trials using `tool/pip-smoke.mjs`, separate from FCM
conformance and `callx-conformance --video`.

| Example | Android / API | PiP result |
|---|---|---|
| Flutter debug | 16 / 36 | Manual/automatic, dismiss/resume, video and branded fallback, end cleanup |
| RN release | 16 / 36 | Manual/automatic, dismiss/resume, video and branded fallback, end cleanup |
| RN release | 10 / 29 | Manual, video and branded fallback, end cleanup |
| Flutter debug and RN release | 11 / 30 | Manual, dismiss/resume, video and branded fallback, end cleanup |

The API 29/30 PiP trials predate the optional root overlay integration; the updated root UI
was checked on API 36. Automatic entry correctly stays disabled below API 31. Physical-device PiP remains pending.

<SponsorCallout reason="verify" />

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

### What the trials are waiting for

| Platform | Needed | Why emulators cannot stand in |
|---|---|---|
| iOS | Results from iPhones on iOS 15 or later, and an Apple Developer Program membership | PushKit and APNs need a paid membership, and the Simulator neither receives VoIP pushes nor keeps CallKit calls |
| Android | Results from the vendors users have: Samsung and Xiaomi first | Vendor battery managers, Bluetooth and real audio paths exist only on hardware |

The recorded Android emulator runs cover several API levels; their dates are listed above. The fastest way to fill
this table is results from phones people already own: if you run the
[acceptance checklist](/guides/testing#acceptance-checklist) on yours, please
[share the results](https://github.com/bear-block/callx/issues/new?template=device-results.yml). They are listed here with credit.

## Help verify

Device coverage is the most valuable contribution right now. You can help by:

- Running the [acceptance checklist](/guides/testing#acceptance-checklist) on your phone and
  [sharing the results](https://github.com/bear-block/callx/issues/new?template=device-results.yml).
- Passing on a phone you no longer use, especially Android 10–12 or a vendor ROM: see
  [help verify on real devices](/sponsor#help-verify-on-real-devices).
- [Sponsoring](/sponsor) the maintainer time that turns results into fixes and releases.
