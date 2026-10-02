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

## Implemented in development, unreleased

- [x] Contract 0.2.0: video fields and camera commands
- [x] Video reporting to CallKit and Telecom; native video views for Flutter and React Native
- [x] LiveKit video, media adapter API 2
- [x] Flutter Android video conformance on API 33 and 36
- [x] Android PiP APIs and compact layouts in both examples
- [x] Optional root call overlay and in-app mini-call exports; incoming stays on Home until accepted
- [x] Flutter Android PiP smoke test on API 36
- [x] RN PiP UI trial on Android 16 emulator, including camera continuity and branded fallback
- [ ] iOS video and physical-device acceptance
- [ ] Release the development changes

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

| # | Provider | Scope | Depends on |
|---|---|---|---|
| 1 | **LiveKit** | Audio in 0.1; video built for the next release, in verification | [Video in the core](/guide/video): done, contract 0.2 |
| 2 | **Twilio** | Twilio Video (media) and Twilio Programmable Voice (signaling: Twilio owns invitations and push) | Video in the core; the signaling adapter interface |
| 3 | **Zoom Video SDK** | Audio and video | Video in the core |
| 4 | **Agora** | Audio and video | Video in the core |

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

- A hosted calling service inside the library.
- Telemetry of any kind in the library.
- Web calling (browsers have no system call UI to integrate with).

Have a use case that is not here? [Start a discussion](https://github.com/bear-block/callx/discussions).
