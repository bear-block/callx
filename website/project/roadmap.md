---
title: "Roadmap"
description: "What is next for Callx, in order, and what each step depends on."
sponsorPrompt: roadmap
---

# Roadmap

Callx grows in small, verified steps. Each milestone ships when it passes automated, emulator and
device checks; dates depend on device coverage and funding. Vote or comment on items in
[GitHub Discussions](https://github.com/bear-block/callx/discussions).

## Available today

The shared Swift and Kotlin core, Flutter and React Native packages with the Expo plugin,
push ingress with CallKit and Core-Telecom, durable recovery, the LiveKit adapter with audio and
video, native video views, picture-in-picture (experimental on iOS), the optional call overlay
and mini-call, native Android lock-screen controls, and the testkit. Release-by-release detail
is in the [changelog](/project/changelog); what has been proven is on the [status page](/project/status).

## Presentation roadmap

| Item | Status | Scope |
|---|---|---|
| Custom Dart/TypeScript call screens | Available | Existing snapshots, commands and native video views |
| Supplied overlay, call screen and mini-call | Available | Branding, custom controls and presentation slots |
| Unified native/custom/supplied UI configuration | Planned | Configure incoming presentation separately from the accepted-call screen; prevent duplicate foreground incoming UI |
| Native call UI configuration from Dart/TypeScript | Planned | Define supported appearance options and platform limits; Android presenter hooks currently require Kotlin |
| iOS system PiP | Experimental; physical acceptance pending | AVKit native surfaces, shared framework APIs; [integration requirements](/guide/video#picture-in-picture-on-ios) |

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
| Physical-device acceptance across iPhone, Pixel, Samsung and Xiaomi | The gate every feature above still has to pass ([status](/project/status)) |
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
| 1 | **LiveKit** | Available | Audio and video; physical/iOS video verification pending | [Video in the core](/guide/video): done, contract 0.2 |
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
