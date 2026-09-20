# @bear-block/callx — React Native native-module preview

Version `0.0.0-preview.1`. The package includes a lazy `NativeModules.Callx` transport,
event emitter, Android/iOS autolinking entry points and an explicit simulator. Native entry
points advertise `nativeCalling: false` until the canonical coordinator is wired.

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
compatible simulator/device and Expo client to explore the same simulated flow.
Web is a preview target, not a production calling support promise.

Expo is the demo host, not a required dependency of the SDK. The native module requires a
development/native build; Expo Go is not the real-call integration path.

## Add to another local React Native app

Build this package first, then from the consumer app:

```sh
npm install /absolute/path/to/callx/packages/react-native
```

The demo already uses `"@bear-block/callx": "file:.."`. Rebuild this package after source edits.
For a self-contained local artifact use `npm pack` here and install the resulting tarball.
The tarball vendors the same canonical Swift/Kotlin sources as the Flutter package; repository
CI verifies byte-for-byte parity against `native/`.

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

If autolinking is missing it rejects with `nativeUnavailable`. The current native scaffold
returns `nativeCalling: false` and rejects commands with `notConfigured` until coordinator
wiring is complete. Native bootstrap, push/permissions/presentation and provider/media wiring
remain separate steps; autolinking does not replace them.

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

Tests use shared fixtures from the development monorepo. Published runtime artifacts would use
only lib/; they have no references to root sources. Preview API is not yet stable.
