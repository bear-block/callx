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

Version `0.2.4` on [pub.dev](https://pub.dev/packages/callx) and
[npm](https://www.npmjs.com/package/@bear-block/callx), contract `0.2.0`: native video with
LiveKit, Android picture-in-picture and optional call UI. Automated, emulator and simulator
results and remaining physical-device checks are on the
[status page](https://bear-block.github.io/callx/project/status). iOS system PiP is unsupported;
iOS video and physical-device acceptance remain unverified.

Callx does not supply a media server, signaling backend or push credentials. The
application starts the native runtime with `CallxBootstrap`, configures its push and
signaling, and either installs a media adapter or connects media from the core's callbacks.

## Documentation

**[bear-block.github.io/callx](https://bear-block.github.io/callx/)**: guides, API reference,
comparison with other libraries, [release notes](https://bear-block.github.io/callx/project/changelog) and project status. Its source is in [`website/`](website)
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
without it media is simulated. Both iOS hosts also integrate the LiveKit audio adapter, but
call lifecycle and two-way audio still need an iPhone trial. Android video has passed Flutter
emulator conformance; both frameworks passed Android 16 UI trials for root call overlay,
in-app mini-call and system PiP. See the [call UI guide](https://bear-block.github.io/callx/guide/call-ui)
for the optional exports and the status page for the OS/build matrix. Web is a demo
target, not a native calling platform.

## Support and services

Callx is free and independent. [Sponsoring it](https://bear-block.github.io/callx/sponsor) funds
the maintenance that keeps it working through every iOS and Android release, and
[device test results](https://github.com/bear-block/callx/issues/new?template=device-results.yml)
from your phones are just as valuable. To add calls to your app, build an adapter for your
provider or debug calls that do not ring, [work with the maintainers](https://bear-block.github.io/callx/services).

## Repository development

The root package is a private TypeScript prototype. Publishable packages live under
`packages/`. Use a Node version supporting direct TypeScript execution and the lockfiles.

```sh
npm ci
npm run test:all      # every suite: tools, contract, typecheck, parity, Kotlin, Swift, Flutter, RN
npm run test:quick    # the same without the native Kotlin and Swift suites
```

Before pushing workflow changes, run `actionlint -shellcheck= -pyflakes=` from the repository
root (install [actionlint](https://github.com/rhysd/actionlint) first). This checks GitHub Actions
context availability as well as workflow syntax; parsing YAML alone does not cover these rules.

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
