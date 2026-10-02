# @bear-block/callx

Native incoming and outgoing calls for React Native and Expo: iOS CallKit, Android Core-Telecom,
VoIP and FCM push handling, and crash recovery in one shared native core. Calls ring even when your
app is not running, answers are never lost on the lock screen, and cancelled calls never ring again.

**[Documentation](https://bear-block.github.io/callx/)** ·
[React Native quick start](https://bear-block.github.io/callx/guide/react-native) ·
[Expo quick start](https://bear-block.github.io/callx/guide/expo) ·
[API reference](https://bear-block.github.io/callx/reference/javascript) ·
[Status](https://bear-block.github.io/callx/project/status)

## Features

- **Native owns the call.** Pushes are received, reported to CallKit or Telecom, and every answer
  and hang-up is recorded natively, before the JavaScript bundle loads.
- **Rings only when it should.** Duplicate, expired, busy and already-cancelled invitations never
  ring; unanswered calls end at a ring deadline.
- **Recovery built in.** A durable journal, idempotent commands with explicit results, and
  replayable events after a crash, a reload or a reboot.
- **Expo with no native code.** The config plugin bootstraps the core and generates the FCM
  service, compatible with React Native Firebase.
- **Bring your own backend and media.** No hosted service and no Firebase or media dependency. Add
  [`@bear-block/callx-livekit`](https://www.npmjs.com/package/@bear-block/callx-livekit) for
  LiveKit audio with no native code.
- **New Architecture.** A typed TurboModule, with a fallback for the legacy architecture.
- **Private by default.** MIT licensed, no telemetry.

## Requirements

| | Minimum |
|---|---|
| React Native | 0.76 (React 18) |
| Expo | SDK 57, development build (not Expo Go) |
| iOS | 15.0, built with Xcode 26 or later |
| Android | API 29 (`minSdkVersion = 29`) |

## Install with Expo

```sh
npx expo install @bear-block/callx
```

```json
{
  "expo": {
    "plugins": [
      ["@bear-block/callx/app.plugin", {
        "microphonePermission": "Acme uses the microphone for calls.",
        "iosVoip": true,
        "androidNotifications": true,
        "androidPush": "fcm"
      }]
    ]
  }
}
```

Then `npx expo prebuild` and `npx expo run:ios` / `npx expo run:android`. Every option is in the
[plugin reference](https://bear-block.github.io/callx/reference/expo-plugin).

## Install with React Native CLI

```sh
npm install @bear-block/callx
cd ios && pod install
```

Set `minSdkVersion = 29`, enable **Push Notifications** and the **Audio** and **Voice over IP**
background modes on iOS, and bootstrap the core from native code:

```kotlin
// Android: MainApplication.onCreate
CallxModule.bootstrap(this)
```

```swift
// iOS: application(_:didFinishLaunchingWithOptions:)
try CallxReactNativeHost.bootstrap(CallxBootstrapConfig())
```

On Android, forward FCM messages from your messaging service to
`CallxBootstrap.started?.ingress?.handlePush(...)`. The
[React Native quick start](https://bear-block.github.io/callx/guide/react-native) shows every file.

## Use it

```ts
import {Callx} from '@bear-block/callx';

export const callx = new Callx();

export async function start() {
  const capabilities = await callx.setup();
  if (!capabilities.nativeCalling) return;

  // Send this to your backend so it can push invitations to this device.
  const token = await callx.getPushToken(); // {type: 'voip' | 'fcm', token}

  return callx.observe(({call}) => {
    // call?.state: incoming, outgoing, connecting, active, held, ended
  });
}

export async function answer(callId: string) {
  const result = await callx.answer(callId);
  if (result.status !== 'applied') console.warn(result.error?.message);
}
```

Your backend sends an APNs VoIP push or an FCM data message with a `callx` invitation; the
[backend guide](https://bear-block.github.io/callx/guides/backend) has the exact payloads.

## Try it without a backend

```ts
import {createCallxPreview} from '@bear-block/callx/preview';

const {callx, simulator} = createCallxPreview();
await callx.setup();
await simulator.incoming({callId: 'demo-1', displayName: 'Alex', handle: 'acme:alex'});
await callx.answer('demo-1'); // connecting
await simulator.mediaConnected(); // active
```

The simulator is an explicit opt-in; `new Callx()` never falls back to it.

## Scope

One live call at a time, voice, iOS and Android (web runs the simulator only). Callx does not
host signaling, send pushes or carry media. See the
[roadmap](https://bear-block.github.io/callx/project/roadmap) and what has been
[verified on devices](https://bear-block.github.io/callx/project/status).

## Support

Callx is free and independent. [Sponsoring it](https://bear-block.github.io/callx/sponsor) funds
the maintenance that keeps it working through every iOS and Android release. You can also help
by [sharing test results](https://github.com/bear-block/callx/issues/new?template=device-results.yml)
from your phone. Need help adding calls to your app? The maintainers take on
[integration work](https://bear-block.github.io/callx/services).

MIT licensed.
