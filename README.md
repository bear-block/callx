# callx

callx targets two libraries: **Flutter on pub.dev** and **React Native on npm**, both
integrating CallKit on iOS and Core-Telecom on Android. The proposal is one Swift core and one
Kotlin core shared by both SDKs; Dart/TypeScript are the API and the bridge, and do not own the lifecycle.
Goal: synchronise signaling, the OS and the media adapter, with recovery and diagnostics while the engine is not ready.

## Status

**Native integration preview.** Both packages have a Dart/TypeScript API, an explicit simulator,
MethodChannel/React Native bridges and the canonical Swift/Kotlin coordinator. The native runtime has
a durable checkpoint/journal, operation query, observation sessions, CallKit/Core-Telecom command
adapters and host ingress for signaling/media. Not declared production-ready, because push delivery,
audio, background recovery and system UI still need acceptance on real devices with the app's own
backend.

## Try the two libraries first

Read the [preview install/usage guide](docs/preview/README.md),
the [Flutter project](packages/flutter/README.md) and the [RN project](packages/react-native/README.md).
Both demos have a call card, controls and an event timeline; they default to the preview so they run on the web.
A native build only reports `nativeCalling: true` after the host app installs a runtime with a platform executor;
there is no silent fallback. Nothing is published to a registry until the device gate is complete.

## Recommended reading

1. [Technical verification and corrections](docs/research/2026-09-12-technical-audit.md)
2. [Architecture](docs/architecture/README.md) and the [detailed implementation guide](docs/architecture/01-implementation-guide.md)
3. [Prior art](docs/plan/00-parity.md), [API draft](docs/plan/01-api.md), [ADRs](docs/adr/0002-command-observation.md)
4. [Next steps](docs/plan/04-next-actions.md) and the [test matrix](docs/plan/03-test-matrix.md)
5. [Internal strategy](docs/strategy/README.md) — no market validation yet

Before development: read the [two-SDK design](docs/architecture/02-dual-sdk.md) and
[architecture readiness](docs/plan/05-architecture-readiness.md). The architecture direction has a basis;
there is native build/unit evidence to develop the integration; device evidence remains the release gate.
[Contract v0.1.0](docs/contract/v0.md) is currently a review candidate with a manifest/validator/fixtures,
not a stable API or native evidence.

## Important boundaries

- iOS CallKit provides the system call UI; Android self-managed needs a notification/presentation
  implemented by the app or the library.
- PushKit is for invitations; cancel/reconcile goes through signaling. mustReport from the OS does not
  turn VoIP pushes into a general cancel transport.
- Native does not depend on Dart/JS but still needs a process the OS lets run. In-RAM timers do not
  survive process death; force-stop/offline has no delivery guarantee.
- Callx does not relay media. Adapters must still coordinate the audio session, routing and microphone.
- Both a BYO backend and a managed cloud can coordinate calls; the cloud is a hypothesis about selling operations.

Details and sources for these boundaries are in the [audit](docs/research/2026-09-12-technical-audit.md).

## Running the prototype

Needs a Node that can run TypeScript directly and a toolchain matching the existing package-lock.

```sh
npm ci
npm test
npm run typecheck
```

Pure tests do not prove push delivery, audio, Recents, the lock screen or native builds.
One live call is the planned v1 scope; multi-call/DTMF/advanced route UI are deferred.
The root `package.json` only serves the original prototype. The two new projects are in packages/;
Flutter is a plugin and RN an autolinkable native module; both vendor the same canonical native core.