---
title: "Packages"
description: "Every Callx package, what it contains, what it depends on and how versions work."
---

# Packages

| Package | Registry | Contains | Depends on |
|---|---|---|---|
| `callx` | [pub.dev](https://pub.dev/packages/callx) | Core for Flutter: Dart API, native core, CallKit and Telecom, push ingress, incoming UI, recovery, simulator | Flutter, the platform |
| `@bear-block/callx` | [npm](https://www.npmjs.com/package/@bear-block/callx) | Core for React Native: TypeScript API, TurboModule, the same native core, Expo config plugin, simulator | React Native ≥ 0.76 |
| `callx_livekit` | [pub.dev](https://pub.dev/packages/callx_livekit) | LiveKit audio/video adapter for Flutter | `callx`, LiveKit Android and Swift SDKs |
| `@bear-block/callx-livekit` | [npm](https://www.npmjs.com/package/@bear-block/callx-livekit) | LiveKit audio/video adapter for React Native, Expo plugin | `@bear-block/callx`, LiveKit Android and Swift SDKs |
| `@bear-block/callx-testkit` | [npm](https://www.npmjs.com/package/@bear-block/callx-testkit) | Call console, test push sender, adapter conformance (development only) | Node.js |

## What the core does not depend on

The native coordination engine has no Firebase or media SDK dependency and no analytics.
Android FCM push integration still requires Firebase configuration in the host app; the Expo
plugin installs its messaging integration. LiveKit SDKs belong to the optional adapters.
Your app supplies signaling and media credentials; no Callx hosted service is required.

## Versions

- All packages release together with the **same version number**.
- Adapters depend on the core with a caret range on the same version, and check the media
  interface's `apiVersion` at bootstrap.
- The current 3.0.1 packages use [contract `0.3.0`](/reference/contract); 0.1.x packages used `0.1.0`.
  Contract versions and media adapter API versions are separate from package versions.
- Breaking changes are always listed in the [changelog](/project/changelog).

## Native dependencies

| Platform | Dependency | Notes |
|---|---|---|
| Android | `androidx.core:core-telecom` | Self-managed calling |
| Android | Kotlin coroutines, kotlinx.serialization | |
| iOS | CallKit, PushKit, AVFAudio | System frameworks |
| LiveKit adapter, Android | `io.livekit:livekit-android` | Needs JitPack for AudioSwitch |
| LiveKit adapter, iOS | LiveKit Swift SDK | Swift Package Manager only |
