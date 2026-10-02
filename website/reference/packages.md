---
title: "Packages"
description: "Every Callx package, what it contains, what it depends on and how versions work."
---

# Packages

| Package | Registry | Contains | Depends on |
|---|---|---|---|
| `callx` | [pub.dev](https://pub.dev/packages/callx) | Core for Flutter: Dart API, native core, CallKit and Telecom, push ingress, incoming UI, recovery, simulator | Flutter, the platform |
| `@bear-block/callx` | [npm](https://www.npmjs.com/package/@bear-block/callx) | Core for React Native: TypeScript API, TurboModule, the same native core, Expo config plugin, simulator | React Native ≥ 0.76 |
| `callx_livekit` | [pub.dev](https://pub.dev/packages/callx_livekit) | LiveKit audio adapter for Flutter | `callx`, LiveKit Android and Swift SDKs |
| `@bear-block/callx-livekit` | [npm](https://www.npmjs.com/package/@bear-block/callx-livekit) | LiveKit audio adapter for React Native, Expo plugin | `@bear-block/callx`, LiveKit Android and Swift SDKs |
| `@bear-block/callx-testkit` | [npm](https://www.npmjs.com/package/@bear-block/callx-testkit) | Call console, test push sender, adapter conformance (development only) | Node.js |

## What the core does not depend on

No Firebase, no media SDK, no analytics, no networking library. Your app keeps full control of
those choices, and installing Callx adds no third-party service.

## Versions

- All packages release together with the **same version number**.
- Adapters depend on the core with a caret range (`^0.1.0`), and check the media interface's
  `apiVersion` at bootstrap.
- The [contract version](/reference/contract) (`0.2.0`) is separate from package versions; it
  changes only when the cross-layer vocabulary changes.
- Until 1.0, minor versions may contain breaking changes, always listed in the
  [changelog](/project/changelog).

## Native dependencies

| Platform | Dependency | Notes |
|---|---|---|
| Android | `androidx.core:core-telecom` | Self-managed calling |
| Android | Kotlin coroutines, kotlinx.serialization | |
| iOS | CallKit, PushKit, AVFAudio | System frameworks |
| LiveKit adapter, Android | `io.livekit:livekit-android` | Needs JitPack for AudioSwitch |
| LiveKit adapter, iOS | LiveKit Swift SDK | Swift Package Manager only |
