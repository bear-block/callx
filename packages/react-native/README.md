# @bear-block/callx

Native call coordination for React Native using iOS CallKit and Android Core-Telecom.
Includes typed commands, call snapshots, operation lookup and observation sessions.

## Start here: choose simulation or a real integration

For a UI-only demonstration, follow **Run the customized example** below. For real
calls, complete these steps in order:

1. Install the package in a native app; choose RN CLI/manual setup or Expo/plugin setup.
2. Configure native permissions, platform reporting and application-scoped runtime.
3. Implement native signaling/media and forward FCM messages to Callx; Callx receives
   VoIP pushes, rings the call and shows the Android call notification.
4. Register device tokens with your backend and send a real call invitation.
5. Use `new Callx()`, check setup capabilities, then verify incoming → answer → audio → end.

The package supplies the coordinator, the native incoming-call path and platform adapter
seams. It does **not** supply a signaling server, push sender or media engine. `setup` cannot
configure those services. The simulator deliberately works without them.

| Integration question | Detailed guide |
|---|---|
| RN CLI or Expo? Which native configuration changes? | [RN CLI and Expo](https://bear-block.github.io/callx/guide/expo) |
| What push do I send? What endpoints do I implement? | [Signaling and APNs/FCM payloads](https://bear-block.github.io/callx/guides/backend) |
| How do I construct and configure the native runtime? | [Native bootstrap](https://bear-block.github.io/callx/guides/native-host) |
| How do retries, state and replay work? | [API and recovery](https://bear-block.github.io/callx/concepts/commands) |

## Expo configuration

For the Expo 57 baseline, install the optional build-time peer if needed:

```sh
npm install --save-dev @expo/config-plugins@57.0.9
```

Add the explicit plugin export to your app configuration:

```json
{
  "expo": {
    "plugins": [["@bear-block/callx/app.plugin", {
      "microphonePermission": "Allow microphone access for voice calls.",
      "iosVoip": true,
      "androidNotifications": true
    }]]
  }
}
```

Then inspect with `npx expo config --type introspect`, run `npx expo prebuild` and
rebuild with `npx expo run:ios` / `npx expo run:android`. The plugin merges iOS audio/
VoIP background modes and microphone text, plus base Android permissions. Optional
`apsEnvironment` explicitly sets APNs entitlement; match your signing environment.
The plugin also raises Android `minSdkVersion` to 29 when it is lower.
It does not generate the Firebase messaging service that forwards to Callx, or the
authenticated runtime bootstrap.
Preserve host code in committed native projects or a reproducible local integration
package before using `prebuild --clean`. Expo Go cannot load Callx native code.

RN CLI consumers do not need Expo or its plugin: apply the manual configuration in
the linked guide, including Android `minSdkVersion = 29`, install pods and rebuild. Autolinking includes native source;
it does not configure your backend or native runtime.

## Status and requirements

Native integration preview; not yet published or production-validated. Supports one
live call. Native calling targets iOS/Android; web is simulator-only. Declared peers:
React `>=18`, React Native `>=0.76`; recorded demo baseline: RN 0.86.3 / Expo 57.
The peer range is not a tested compatibility matrix. Native builds require iOS 15+
/ Swift 6 or Android API 29+ and a compatible native toolchain. Bring your own
signaling/media integration, push setup and app permissions. Expo is optional;
Expo users need a development/native build for real calls.

Version `0.0.0-preview.1`. The package includes a typed `Callx` TurboModule (Codegen spec
`src/specs/NativeCallx.ts`, with a `NativeModules.Callx` fallback on the legacy architecture), an
event emitter, Android/iOS autolinking entry points, canonical Kotlin/Swift coordinator and an
explicit simulator. Native entry points advertise `nativeCalling: false` until the app host
installs a runtime with a real platform executor.

Read the [English integration and API guides](https://bear-block.github.io/callx/)
for architecture, native bootstrap, recovery and device acceptance.

## Run the customized example now

From this package directory:

```sh
npm ci
npm run build
cd example
npm ci
npm run web
```

The example uses Expo 57 / React Native 0.86.3 / React 19.2.3, resolved from the official
blank TypeScript template for this preview. Use `npm run ios` or `npm run android` with a
compatible simulator/device to build the example's Device mode: real CallKit/Core-Telecom,
local signaling controls, optional FCM test pushes on Android and simulated media (no audio). Its example-only Expo
plugin installs native bootstrap; SDK setup waits for checkpoint recovery. See the
[example guide](https://github.com/bear-block/callx/blob/main/packages/react-native/example/README.md).
Web is a preview target, not a production calling support promise.

Expo is the demo host, not a required dependency of the SDK. The native module requires a
development/native build; Expo Go is not the real-call integration path.

## Try it in your own app before release

The package is not on npm yet, so install it from this checkout. Choose one way:

- **Link the folder** while you are changing Callx. npm points your app at this folder, so
  it picks up later changes after each `npm run build`:

  ```sh
  cd /absolute/path/to/callx/packages/react-native
  npm ci && npm run build
  cd /path/to/your-app
  npm install /absolute/path/to/callx/packages/react-native
  ```

- **Install a packed copy** to test exactly what npm would publish. `npm pack` builds the
  package and prints the `.tgz` file name:

  ```sh
  cd /absolute/path/to/callx/packages/react-native
  npm ci && npm pack
  cd /path/to/your-app
  npm install /absolute/path/to/callx/packages/react-native/bear-block-callx-<version>.tgz
  ```

Either way, the package contains native code, so rebuild the app rather than only reloading
JavaScript: run `pod install` in `ios/` and build both platforms, or with Expo run
`npx expo prebuild` and then `npx expo run:ios` / `npx expo run:android`. The example in this
repository already links the package with `"@bear-block/callx": "file:.."`.

## Try the API

```ts
import {createCallxPreview} from '@bear-block/callx/preview';

async function demo() {
  const {callx, simulator} = createCallxPreview(); // Explicit opt-in.
  const unsubscribe = callx.observe(snapshot => {
    console.log(snapshot.sequence, snapshot.call?.state);
  });
  await callx.setup({appName: 'Acme Support'});

  // Test harness only — production invitation arrives through native ingress.
  await simulator.incoming({callId: 'demo-1', displayName: 'hao.dev7', handle: 'sip:hao.dev7@example.invalid'});
  const result = await callx.answer('demo-1');
  console.log(result.execution); // preview
  // Answer gives connecting, not real media readiness.
  await simulator.mediaConnected(); // No microphone or audio is started.
  await callx.setMuted('demo-1', true);
  await callx.setHeld('demo-1', true);
  await callx.setHeld('demo-1', false);
  await callx.end('demo-1');

  unsubscribe(); // Detach observer, not a hangup operation.
  callx.dispose(); // Release preview instance when its owner is done.
}
```

## Installation after publication

```sh
npm install @bear-block/callx
```

The intended native construction is:

```ts
import {Callx} from '@bear-block/callx';
const callx = new Callx();
await callx.setup({appName: 'Acme Support'});
```

If autolinking is missing it rejects with `nativeUnavailable`. An unwired native host returns
`nativeCalling: false` and rejects commands with `notConfigured`. Native bootstrap,
push/permissions/presentation and provider/media wiring
remain separate steps; autolinking does not replace them.

## Native host wiring

Create one durable coordinator and a platform executor backed by native signaling/media, then
install the runtime before JavaScript calls `setup`. The [native bootstrap guide](https://bear-block.github.io/callx/guides/native-host)
shows how `telecomExecutor` and `callKitExecutor` are assembled from the packaged adapters and
how to reconcile work left pending by a previous process. In BYO signaling mode also create
`CallKitIngress` / `TelecomIngress`, which receive pushes and ring the call. In Swift,
`import callx_react_native`.

```kotlin
val runtime = BridgeRuntime(coordinator, telecomExecutor,
  BridgeCapabilities(accountGeneration, true, false, hold = true, mute = true))
CallxModule.configure(runtime)
```

```swift
let runtime = BridgeRuntime(coordinator: coordinator, executor: callKitExecutor,
  capabilities: .init(accountGeneration: accountGeneration, durableReplay: true,
    providerManagedSignaling: false, hold: true, mute: true),
  nowMs: { Int64(Date().timeIntervalSince1970 * 1000) })
CallxReactNativeHost.configure(runtime)
```

Push/signaling calls `reportIncoming`, `remoteAnswered` and `remoteEnded` on the runtime; media
calls `mediaConnected` only when media is actually usable. The JS thread is never the CallKit or
Core-Telecom action performer.

## Preview contract and limits

- One live call; incoming/outgoing → connecting → active/held → ended.
- Typed commands return operationId/status/execution; invalid operations throw CallxError.
- Save `capabilities.accountGeneration`, then use
  `queryOperation(operationId, accountGeneration)` after an ambiguous timeout. The lookup is
  `available`, `unavailable`, or `generationMismatch`; `unavailable` is not proof that the
  command never ran.
- Durable-observation shape is available through `openSession(afterSequence?)`,
  `observeEvents(sessionId, listener)`, `acknowledge(...)`, and `closeSession(...)`. Preview
  replay is memory-only and deliberately reports `durableReplay: false`.
- Immutable snapshots include decimal-string sequence. observe gives current state immediately.
- Unsubscribe is independent from ending a call.
- No native UI, push, background runtime, real audio, network, timeout simulation or durable replay.
- `Callx` uses the native backend by default. The simulator is never an automatic fallback.
- The `/preview` export is separate: normal imports never silently enable a fake call.

## Check

```sh
npm test
npm pack --dry-run
cd example
npm run typecheck
npm run build:web
```

Tests use shared fixtures from the development monorepo. Published artifacts contain
`lib/` plus native Android/iOS sources and autolinking metadata; they do not require
root sources at runtime. Preview API is not yet stable.

## Build and release

`npm run build` compiles TypeScript; `npm pack` runs the build and produces a
self-contained tarball with native sources. Install that tarball in clean native
consumers before publishing. Follow the full
[build-to-npm runbook](https://bear-block.github.io/callx/project/contributing)
for versioning, device evidence and `--access public --tag preview` publication.
Do not publish from the monorepo root.

## Troubleshooting and support

`nativeUnavailable` means the native module is unavailable in the current host;
`notConfigured` means host runtime setup is missing. Rebuild the native app after
installation; Metro reload cannot install native code. See the
[troubleshooting guide](https://bear-block.github.io/callx/guides/testing).
Report package/framework/OS versions and a minimal reproduction with sanitized logs;
omit credentials and push tokens.

## License

MIT. See [LICENSE](LICENSE). Third-party platform/provider dependencies retain their
own licenses and configuration requirements.
