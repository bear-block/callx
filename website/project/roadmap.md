---
title: "Roadmap"
description: "What is next for Callx, in order, and what each step depends on."
sponsorPrompt: roadmap
---

# Roadmap

Callx grows in small, verified steps. Each milestone ships when it passes automated, emulator and
device checks; dates depend on device coverage and funding. Vote or comment on items in
[GitHub Discussions](https://github.com/bear-block/callx/discussions).

## Now: 0.1

- [x] Shared Swift and Kotlin core with contract `0.1.0`
- [x] Flutter and React Native packages, New Architecture TurboModule
- [x] Library-owned incoming path: PushKit and FCM ingress, CallKit and Core-Telecom
- [x] Durable journal, replay, operation lookup, recovery after process death
- [x] Native Android incoming screen, repeating ringtone, lock-screen answer policy
- [x] Media adapter interface, discovery and the LiveKit adapter
- [x] Expo config plugin with no native code, including the FCM service
- [x] Testkit: call console, test pushes, adapter conformance
- [ ] Physical-device acceptance across iPhone, Pixel, Samsung and Xiaomi ([status](/project/status))

## Next: 0.2

| Item | Why |
|---|---|
| Device lab results published for every release | Trust comes from evidence, not claims |
| iOS conformance on a real iPhone, automated where possible | Parity with Android's conformance run |
| Android Direct Boot | Ring before the first unlock after a reboot |
| `updateDisplay` (change caller name during a call) | Common request when migrating |
| Per-call ringtone | Common request |

## Providers, in order

After the device trials, Callx grows provider by provider. Each one ships for Flutter and
React Native together and passes the conformance suite before release.

| # | Provider | Scope | Depends on |
|---|---|---|---|
| 1 | **LiveKit** | Audio today; video next | Native video in the core: camera, call type, rendering the provider's video in Flutter and React Native |
| 2 | **Twilio** | Twilio Video (media) and Twilio Programmable Voice (signaling: Twilio owns invitations and push) | Video in the core; the signaling adapter interface |
| 3 | **Zoom Video SDK** | Audio and video | Video in the core |
| 4 | **Agora** | Audio and video | Video in the core |

Queued, by demand: Daily, Vonage, 100ms, Stream Video, Amazon Chime SDK, Telnyx, Plivo, Sinch and
SIP stacks. Tell us what you need in [GitHub Discussions](https://github.com/bear-block/callx/discussions).

## Later

| Item | Depends on |
|---|---|
| **Multiple calls**: call waiting, hold-and-swap | Contract `0.2` |
| **`@bear-block/callx-server`**: payload builders and push helpers for Node.js backends | Stable invitation schema |
| **DTMF** | Provider support |

<SponsorCallout reason="roadmap" />

## Not planned

- A hosted calling service inside the library.
- Telemetry of any kind in the library.
- Web calling (browsers have no system call UI to integrate with).

Have a use case that is not here? [Start a discussion](https://github.com/bear-block/callx/discussions).
