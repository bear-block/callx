---
title: "Try without a backend"
description: "Explore the Callx API with the built-in simulator, with no backend, device or credentials."
---

# Try without a backend

Both packages include a simulator: an in-memory backend that implements the same contract as
the native core. Use it to build your call screens, write widget and component tests, or just
see how states and results behave. It starts no microphone and contacts no network.

The simulator is an explicit opt-in. Callx never falls back to it silently: `new Callx()` and
`Callx()` always use the native core.

::: code-group

```ts [React Native]
import {createCallxPreview} from '@bear-block/callx/preview';

const {callx, simulator} = createCallxPreview();
const stop = callx.observe(snapshot => console.log(snapshot.sequence, snapshot.call?.state));
await callx.setup({appName: 'Acme'});

// What a push would do in production:
await simulator.incoming({callId: 'demo-1', displayName: 'Alex', handle: 'acme:alex'});
// state: incoming

const result = await callx.answer('demo-1');
console.log(result.status, result.execution); // applied preview
// state: connecting (answered is not connected)

await simulator.mediaConnected();
// state: active

await callx.setMuted('demo-1', true);
await callx.setHeld('demo-1', true);  // state: held
await callx.setHeld('demo-1', false); // state: active
await callx.end('demo-1');            // state: ended, endReason: localHangup

stop();          // Detaches the observer; it is not a hang-up.
callx.dispose();
```

```dart [Flutter]
import 'package:callx/callx.dart';
import 'package:callx/callx_preview.dart';

final preview = CallxPreview();
final callx = preview.callx;
final subscription = callx.snapshots.listen(
  (snapshot) => print('${snapshot.sequence}: ${snapshot.call?.state.name}'),
);
await callx.setup(const CallxConfig(appName: 'Acme'));

// What a push would do in production:
await preview.simulator.incoming(
  const CallInput(callId: 'demo-1', displayName: 'Alex', handle: 'acme:alex'),
);

final result = await callx.answer('demo-1'); // connecting
print('${result.status.name} ${result.execution.name}'); // applied preview

await preview.simulator.mediaConnected(); // active
await callx.setMuted('demo-1', true);
await callx.setHeld('demo-1', true);
await callx.setHeld('demo-1', false);
await callx.end('demo-1');

await subscription.cancel();
await callx.dispose();
```

:::

The simulator also offers `remoteAnswered()` (the other side picked up your outgoing call),
`remoteEnded()` and `reset()`.

## Run the example apps

The repository has a full example app for each framework, with a simulator mode and a device
mode wired to real CallKit and Core-Telecom:

```sh
git clone https://github.com/bear-block/callx && cd callx
npm ci
npm run ios:rn          # or: ios:flutter, android:rn, android:flutter
```

| Flutter | React Native |
|---|---|
| ![Flutter example](/screenshots/flutter.png) | ![React Native example](/screenshots/react-native.png) |
