---
title: "Compare"
description: "Compare Callx native coordination, media and optional UI with callkeep, Expo and Flutter alternatives, including verification limits."
---

# Compare

Choose separately for native call coordination, media and app presentation. Reporting a video
call to CallKit/Telecom does not itself provide a video renderer, an in-app mini-call or system PiP.
Callx combines these layers while keeping one native call-state owner and optional UI/media.

::: info Reviewed on 2026-10-04
Callx describes the latest release, contract **0.2.0**. Other package versions were checked
against npm/pub.dev, and capabilities against the official project documentation linked below.
This is a documentation review, not a device benchmark or conformance test of other libraries.
“Not assessed” means we have not established support or absence; it does not mean unsupported.
:::

## Packages and scope

| Option | Framework | Registry version at review | Role |
|---|---|---|---|
| **Callx** | Flutter, React Native, Expo development builds | [npm](https://www.npmjs.com/package/@bear-block/callx) · [pub.dev](https://pub.dev/packages/callx) | Native coordination, optional media adapter and app UI |
| [react-native-callkeep](https://github.com/react-native-webrtc/react-native-callkeep#readme) | React Native | [4.3.16](https://www.npmjs.com/package/react-native-callkeep) | CallKit/ConnectionService bridge |
| [expo-callkit-telecom](https://github.com/mfairley/expo-callkit-telecom#readme) | React Native with Expo modules | [0.5.0](https://www.npmjs.com/package/expo-callkit-telecom) | Native calling, push and audio-session integration |
| [flutter_callkit_incoming](https://github.com/hiennguyen92/flutter_callkit_incoming#readme) | Flutter | [3.1.6](https://pub.dev/packages/flutter_callkit_incoming) | Incoming presentation and call actions |
| [connectycube_flutter_call_kit](https://github.com/ConnectyCube/connectycube-flutter-call-kit) | Flutter | [2.8.2](https://pub.dev/packages/connectycube_flutter_call_kit) | Another incoming-call integration option; not feature-audited here |
| Vendor SDKs | Per vendor | Check vendor | Media and/or hosted calling services; compare each SDK's system integration |
| Custom CallKit/Telecom integration | Any native host | Your implementation | You maintain lifecycle, push, media and presentation |

Callx is MIT licensed. Check the linked projects' licenses and provider terms before adoption.

## Native coordination

**Documented** means the capability is described in the linked official documentation.
**Host integration** means the app needs additional wiring. **Not assessed** avoids inferring
missing behavior from a README. Callx implementation and verification are separate; see [status](/project/status).

| Capability | Callx | callkeep | expo-callkit-telecom | flutter_callkit_incoming |
|---|---|---|---|---|
| Flutter and React Native share one core | Available | React Native | React Native / Expo modules | Flutter |
| Native iOS VoIP ingress | Available | Host integration with separate push module | Documented | AppDelegate integration |
| Android incoming push path | Native FCM host | Host integration | Native FCM integration documented | Host messaging integration |
| Android system integration | Self-managed Core-Telecom | ConnectionService, including self-managed mode | Core-Telecom documented | Android incoming presentation; Telecom details not assessed here |
| Durable coordinator snapshots, command results and replay | Available | Initial events documented; equivalent durable protocol not assessed | Session API documented; equivalent durable protocol not assessed | activeCalls documented; equivalent durable protocol not assessed |
| Persistent cancellation tombstones | Available within contract retention/account scope | Not assessed | Not assessed | Not assessed |
| Video reporting to system call UI | Available | Documented | Documented | Audio/video type documented |
| DTMF | Not shipped; roadmap | Documented | Documented | Not assessed |
| Multiple live calls | One live call; roadmap | Documented | Not assessed | Not assessed |
| iOS Siri/Recents start-call integration | Not shipped | Start-call event documented | Documented | Not assessed |

Sources: [callkeep README](https://github.com/react-native-webrtc/react-native-callkeep#readme),
[Expo module README](https://github.com/mfairley/expo-callkit-telecom#readme),
[Flutter incoming README](https://github.com/hiennguyen92/flutter_callkit_incoming#readme).
Push integration and reporting deadlines still require platform-specific setup in every app.

## Media and presentation

| Capability | Callx | Other options in this page |
|---|---|---|
| Native audio/video adapter | LiveKit installable; own-media interface available | Evaluate the chosen library together with its media engine |
| Native video surfaces and camera commands | Available for Flutter and RN; Android video trials, iPhone acceptance pending | Not assessed; system video reporting alone is insufficient evidence |
| Android system PiP | Available; video/local/branding fallback and emulator trials | Not assessed |
| iOS system PiP | Experimental ([setup](/guide/video#picture-in-picture-on-ios)); physical acceptance pending | Not assessed |
| Root overlay and in-app mini-call | Optional exported Dart/TypeScript components; retains native call state | Not assessed |
| Supplied customizable call screen | Colors/logo, header/status/end slots, control sizes, preview placement and host video rendering | Incoming customization exists in some options; accepted-call UI not assessed |
| Foreground-aware video controls | Five-second idle hide, fresh timeout on return, screen-reader/reduced-motion handling | Not assessed |
| Android ongoing controls while securely locked | Native timer, mute, hold and Telecom audio controls; API36 warm-process trial | Not assessed |
| Unified native/custom/supplied UI switch | Planned; use existing independent customization surfaces | Not assessed |
| Guided setup/code generation | Dart/TypeScript starter files, native checklist and migration paths | Not assessed |

The camera does not auto-start when a video invitation is answered while locked. Callx's
Android locked screen and Apple's CallKit UI are different platform surfaces. Watch the
[two-device demo](/guide/demos) and [secure-lock demo](/guide/lockscreen-demo), or explore
[features](/guide/features) and [call UI customization](/guide/call-ui).

## Provider ecosystem

| Callx adapter | Status | Scope |
|---|---|---|
| [LiveKit](/guide/livekit) | Available: audio and video | Native media |
| Twilio Video | Planned next; no package | Media |
| Twilio Programmable Voice | Planned; signaling interface required | Provider-managed signaling |
| Zoom Video SDK | Planned; no package | Media |
| Agora | Planned; no package | Media |

Planned adapters are not installable integrations. Vendor SDKs may be used independently of
Callx; each has its own media, signaling, licensing and system-call behavior. A hosted Callx
backend is unavailable. See [provider priorities](/project/roadmap#providers-in-order).

## Choose for your app

- **Callx:** shared Flutter/RN integration, native snapshots/results/recovery, optional video,
  customizable UI and Android PiP, with your own signaling backend. Match your device needs
  to the documented verification levels before rollout.
- **callkeep:** React Native apps needing its documented DTMF, multi-call or ConnectionService
  modes, with app-owned push/media wiring.
- **expo-callkit-telecom:** Expo-module apps needing documented native push, Core-Telecom,
  audio-session integration, DTMF or Siri intents.
- **flutter_callkit_incoming:** Flutter apps needing its documented incoming-screen customization
  and call actions while owning the messaging/media setup.
- **Vendor SDK or custom native integration:** evaluate the required hosted features or the
  cost of maintaining your own native stack; neither is interchangeable with a UI component.

Callx does not currently ship DTMF, multi-call or a hosted backend, and iOS picture-in-picture is
experimental. Physical-device call acceptance remains pending. Follow the [setup guide](/guide/setup)
and [migration rollout](/guides/migration-rollout) rather than switching call ownership mid-call.
