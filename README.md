# Callx

Callx provides native call coordination for Flutter and React Native through a shared
Swift core on iOS and a shared Kotlin core on Android.

| Package | Flutter (pub.dev) | React Native (npm) |
|---|---|---|
| Core: CallKit and Telecom, push ingress, incoming UI, recovery, the media adapter interface | [`callx`](packages/callx/README.md) | [`@bear-block/callx`](packages/react-native/README.md) |
| LiveKit media adapter (optional; installing it is the whole integration) | [`callx_livekit`](packages/callx_livekit/README.md) | [`@bear-block/callx-livekit`](packages/react-native-livekit/README.md) |
| Device-trial tools: call console, test pushes, adapter conformance | — | [`@bear-block/callx-testkit`](packages/testkit/README.md) |

Bring your own media with the core alone, or install an adapter
([ADR-0009](https://bear-block.github.io/callx/project/decisions)).

## Status

Version `0.1.0` on [pub.dev](https://pub.dev/packages/callx) and
[npm](https://www.npmjs.com/package/@bear-block/callx), contract `0.1.0`. Automated, emulator and
simulator checks pass; physical-device verification is tracked on the
[status page](https://bear-block.github.io/callx/project/status).

Callx does not supply a media server, signaling backend or push credentials. The
application starts the native runtime with `CallxBootstrap`, configures its push and
signaling, and either installs a media adapter or connects media from the core's callbacks.

## Documentation

**[bear-block.github.io/callx](https://bear-block.github.io/callx/)**: guides, API reference,
comparison with other libraries and project status. Its source is in [`website/`](website)
(`npm run docs:dev`).

1. [Architecture and ownership](https://bear-block.github.io/callx/concepts/architecture).
2. [Installation and usage](https://bear-block.github.io/callx/guide/).
3. [Native host integration](https://bear-block.github.io/callx/guides/native-host).
4. [API behavior and recovery](https://bear-block.github.io/callx/concepts/commands).
5. [Testing and acceptance](https://bear-block.github.io/callx/guides/testing).
6. [Signaling, backend endpoints and push payloads](https://bear-block.github.io/callx/guides/backend).
7. [RN CLI and Expo config plugin](https://bear-block.github.io/callx/guide/expo).
8. [Building from source and contributing](https://bear-block.github.io/callx/project/contributing).

Both example apps include an explicit simulator with call controls and an event timeline.
Both also have a Device mode wired to native CallKit/Core-Telecom, with optional test pushes
(FCM on Android for both; PushKit on iOS for Flutter only) and a local call console
(`npm run call:console`). On Android, with `npm run media:server` (a local LiveKit server in
Docker), answered calls carry real two-way audio between the device and the console page;
without it media is simulated. iOS media is still simulated. Web is a demo
target, not a native calling platform.

## Repository development

The root package is a private TypeScript prototype. Publishable packages live under
`packages/`. Use a Node version supporting direct TypeScript execution and the lockfiles.

```sh
npm ci
npm run test:all      # every suite: tools, contract, typecheck, parity, Kotlin, Swift, Flutter, RN
npm run test:quick    # the same without the native Kotlin and Swift suites
```

Build and run an example straight on a device:

```sh
npm run android:flutter   # or android:rn, ios:flutter, ios:rn
npm run app -- rn ios --device <udid> --release   # any example/platform, with options
npm run build:android     # build both examples without a device (also build:ios)
```

Android uses the first connected device or boots the first emulator (`--avd <name>`), and
uninstalls the other example first because both share the package `dev.bearblock.callx`.
iOS uses the booted simulator or boots an iPhone simulator (`--simulator <name>`); pass
`--device <udid>` for a physical iPhone. Unlock a freshly booted device once: until then
Android does not start the app.

Edit canonical native sources under `native/`, then run
`./tool/sync_native_sources.sh` and verify parity again. Each distributed package
vendors the sources so consumers do not depend on the monorepo.

Historical research, ADRs and strategy are indexed in the documentation directory.
Some historical material is in Vietnamese and records proposals rather than current behavior.
