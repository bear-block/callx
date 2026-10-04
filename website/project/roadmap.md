---
title: "Roadmap"
description: "What is next for Callx, in order, and what each step depends on."
sponsorPrompt: roadmap
---

# Roadmap

Callx grows in small, verified steps. Each milestone ships when it passes automated, emulator and
device checks; dates depend on device coverage and funding. Vote or comment on items in
[GitHub Discussions](https://github.com/bear-block/callx/discussions).

## Released: 0.1.3

- [x] Shared Swift and Kotlin core with contract `0.1.0`
- [x] Flutter and React Native packages, New Architecture TurboModule
- [x] Library-owned incoming path: PushKit and FCM ingress, CallKit and Core-Telecom
- [x] Durable journal, replay, operation lookup, recovery after process death
- [x] Native Android incoming screen, repeating ringtone, lock-screen answer policy
- [x] Media adapter interface, discovery and the LiveKit adapter
- [x] Expo config plugin with no native code, including the FCM service
- [x] Testkit: call console, test pushes, adapter conformance
- [ ] Physical-device acceptance across iPhone, Pixel, Samsung and Xiaomi ([status](/project/status))

## Released: 0.2.2

- [x] Contract 0.2.0: video fields and camera commands
- [x] Video reporting to CallKit and Telecom; native video views for Flutter and React Native
- [x] LiveKit video, media adapter API 2
- [x] Flutter Android video conformance on API 33 and 36
- [x] Android PiP APIs and compact layouts in both examples
- [x] Optional root call overlay and in-app mini-call exports; incoming stays on Home until accepted
- [x] Flutter Android PiP smoke test on API 36
- [x] RN PiP UI trial on Android 16 emulator, including camera continuity and branded fallback
- [x] Flutter/RN video-call secure PIN lock-screen trials on Android 16 (API 36)
- [ ] Video-call lock-screen acceptance on remaining Android APIs, iOS and physical devices
- [ ] iOS video and physical-device acceptance
- [x] Publish 0.2.2 packages on npm and pub.dev

## Released: 0.2.3

Version 0.2.3 adds equal-sized direct framework controls, a top local preview, foreground-aware
auto-hide and persistent native presentation after locked Answer, with timer,
mute, hold and Telecom audio routes. Open app explicitly requests unlocking. See the
[development-build demo](/guide/lockscreen-demo); these changes require 0.2.3.

## Presentation roadmap

| Item | Status | Scope |
|---|---|---|
| Custom Dart/TypeScript call screens | Available | Existing snapshots, commands and native video views |
| Supplied overlay, call screen and mini-call | Released in 0.2.2 | Branding, custom controls and presentation slots |
| Unified native/custom/supplied UI configuration | Planned | Configure incoming presentation separately from the accepted-call screen; prevent duplicate foreground incoming UI |
| Native call UI configuration from Dart/TypeScript | Planned | Define supported appearance options and platform limits; Android presenter hooks currently require Kotlin |
| iOS system PiP | Not implemented; scope to be defined | Separate from the framework mini-call |

Custom presentation retains native call ownership and the required system integration.

## Guided integration and native SDKs

| Item | Status | Scope |
|---|---|---|
| [Interactive setup guide](/guide/setup) | Implemented in docs | Select framework, OS, presentation, media, backend and migration path; generate copyable Dart/TypeScript starter files, native fragments and integration checkpoints |
| [Detailed migration journeys](/guides/migration-rollout) | Implemented in docs | CallKeep and flutter_callkit_incoming: ownership, backend routing, staged rollout and rollback |
| Standalone Android SDK | In development; not published | Local Maven packaging and independent consumer compile check; Kotlin API and runnable native example pending; optional Compose UI to be scoped |
| Standalone iOS SDK | In development; not published | Root Swift package and independent iOS consumer compile check; Swift API and runnable native example pending; optional SwiftUI UI to be scoped |
| Callx hosted backend service | Future direction; unavailable | A separate optional service; authentication, signaling, push delivery, operations and pricing need their own design |

Standalone SDKs must reuse the same native core and contract as Flutter and React Native.
Native host APIs already exist inside the framework packages; they are not yet a separately
published Kotlin/Swift product. Hosted service work has no release date. Callx remains usable
with your own backend and media without a Callx account or hosted-service dependency.

## Remaining core work

| Item | Why |
|---|---|
| Emulator matrix and community device results published for every release | Trust comes from evidence, not claims |
| iOS conformance on a real iPhone, automated where possible | Parity with Android's conformance run |
| Android Direct Boot | Ring before the first unlock after a reboot |
| `updateDisplay` (change caller name during a call) | Common request when migrating |
| Per-call ringtone | Common request |

## Providers, in order

Callx grows provider by provider. Each one ships for Flutter and React Native together and
passes conformance before release. Physical-device acceptance remains a release gate;
development and emulator checks can proceed while those trials are pending.

| # | Provider | Status | Scope | Depends on |
|---|---|---|---|---|
| 1 | **LiveKit** | Audio/video released in 0.2.2 | Audio and video; physical/iOS video verification pending | [Video in the core](/guide/video): done, contract 0.2 |
| 2 | **Twilio** | Planned next; not implemented | Twilio Video (media) and Twilio Programmable Voice (signaling: Twilio owns invitations and push) | Video in the core; the signaling adapter interface |
| 3 | **Zoom Video SDK** | Planned; not implemented | Audio and video | Video in the core |
| 4 | **Agora** | Planned; not implemented | Audio and video | Video in the core |

Only LiveKit currently has an installable Callx adapter. Planned providers have no release
date; the order above is a development priority, not a shipping commitment.

Queued, by demand: Daily, Vonage, 100ms, Stream Video, Amazon Chime SDK, Telnyx, Plivo, Sinch and
SIP stacks. Tell us what you need in [GitHub Discussions](https://github.com/bear-block/callx/discussions).

## Later

| Item | Depends on |
|---|---|
| **Multiple calls**: call waiting, hold-and-swap | A future contract extension; contract 0.2 still allows one live call |
| **`@bear-block/callx-server`**: payload builders and push helpers for Node.js backends | Stable invitation schema |
| **DTMF** | Provider support |

<SponsorCallout reason="roadmap" />

## Not planned

- A mandatory hosted-service dependency inside the library. Any future hosted backend is a separate, optional product.
- Telemetry of any kind in the library.
- Web calling (browsers have no system call UI to integrate with).

Have a use case that is not here? [Start a discussion](https://github.com/bear-block/callx/discussions).
