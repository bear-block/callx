# @bear-block/callx — React Native SDK experience preview

Version `0.0.0-preview.1`. **Local preview, not published. No native calling yet.**
Publishing is disabled with `private: true`. The package is a typed API shell plus an
explicit simulator, not a completed TurboModule.

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

Expo is the demo host, not a required dependency of the SDK. A future custom native module
will require a development/native build; Expo Go is not the real-call integration path.

## Add to another local React Native app

Build this package first, then from the consumer app:

```sh
npm install /absolute/path/to/callx/packages/react-native
```

The demo already uses `"@bear-block/callx": "file:.."`. Rebuild this package after source edits.
For a self-contained local artifact use `npm pack` here and install the resulting tarball.

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
  await simulator.incoming({callId: 'demo-1', displayName: 'hao.dev7'});
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

## Installation after a future release — hypothetical

Once the real package is published under an available/owned name:

```sh
npm install @bear-block/callx
```

The intended native construction is:

```ts
import {Callx} from '@bear-block/callx';
const callx = new Callx();
await callx.setup({appName: 'Acme Support'});
```

**Today this setup rejects with `nativeNotImplemented`.** The registry install command does
not install this unpublished preview. Native app bootstrap, push/permissions/presentation and
provider/media wiring will remain separate steps. TurboModule autolinking does not replace them.

## Preview contract and limits

- One live call; incoming/outgoing → connecting → active/held → ended.
- Typed commands return operationId/status/execution; invalid operations throw CallxError.
- Immutable snapshots include decimal-string sequence. observe gives current state immediately.
- Unsubscribe is independent from ending a call.
- No native UI, push, background runtime, real audio, network, timeout simulation or durable replay.
- Production will use a native-backed CallxBackend. The simulator is not a production reducer.
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
