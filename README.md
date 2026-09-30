# Callx

Callx provides native call coordination for Flutter and React Native through a shared
Swift core on iOS and a shared Kotlin core on Android.

| Framework | Package | Guide |
|---|---|---|
| Flutter | `callx` for pub.dev | [Flutter](packages/callx/README.md) |
| React Native | `@bear-block/callx` for npm | [React Native](packages/react-native/README.md) |

## Status

Native integration preview `0.0.0-preview.1`, contract candidate `0.1.0`.
Local installation and simulated demos are available; registry publication is pending.
Native cores, framework transports and platform command adapters have build/test evidence.
Push delivery, two-way audio, lock-screen behavior and process recovery still require
device/backend acceptance.

Callx does not supply a media server, signaling backend, push credentials or a complete
provider integration. The application must configure the native runtime and supply
these services. Installing a package alone does not enable calls.

## Documentation

Start with the [English documentation](docs/README.md):

1. [Architecture and ownership](docs/guides/architecture.md).
2. [Installation and usage](docs/guides/getting-started.md).
3. [Native host integration](docs/guides/native-integration.md).
4. [API behavior and recovery](docs/guides/api.md).
5. [Testing and acceptance](docs/guides/acceptance.md).
6. [Build and release to npm/pub.dev](docs/guides/build-and-release.md).
7. [Repository maintenance](docs/guides/repository-maintenance.md).
8. [Signaling, backend endpoints and push payloads](docs/guides/signaling-and-push.md).
9. [RN CLI and Expo config plugin](docs/guides/react-native-and-expo.md).

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
