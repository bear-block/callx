# callx

Native incoming and outgoing calls for Flutter: iOS CallKit, Android Core-Telecom, VoIP and FCM
push handling, and crash recovery in one shared native core. Calls ring even when your app is not
running, answers are never lost on the lock screen, and cancelled calls never ring again.

**[Documentation](https://bear-block.github.io/callx/)** ·
[Flutter quick start](https://bear-block.github.io/callx/guide/flutter) ·
[API reference](https://bear-block.github.io/callx/reference/dart) ·
[Status](https://bear-block.github.io/callx/project/status)

## Features

- **Native owns the call.** Pushes are received, reported to CallKit or Telecom, and every answer
  and hang-up is recorded natively, before the Flutter engine starts.
- **Rings only when it should.** Duplicate, expired, busy and already-cancelled invitations never
  ring; unanswered calls end at a ring deadline.
- **Recovery built in.** A durable journal, idempotent commands with explicit results, and
  replayable events after a crash, a hot restart or a reboot.
- **Bring your own backend and media.** No hosted service and no Firebase or media dependency. Add
  [`callx_livekit`](https://pub.dev/packages/callx_livekit) for LiveKit audio with no native code.
- **Same core as React Native.** [`@bear-block/callx`](https://www.npmjs.com/package/@bear-block/callx)
  runs the same Swift and Kotlin sources.
- **Private by default.** MIT licensed, no telemetry.

## Requirements

| | Minimum |
|---|---|
| Flutter | 3.41 (Dart 3.11) |
| iOS | 15.0, built with Xcode 26 or later |
| Android | API 29 (`minSdk = 29`) |

## Install

```sh
flutter pub add callx
```

Set `minSdk = 29` in `android/app/build.gradle.kts`. On iOS, enable **Push Notifications** and the
**Audio** and **Voice over IP** background modes, and add `NSMicrophoneUsageDescription`.

## Bootstrap the native core

The core starts with the process, before any push can arrive.

```kotlin
// Android: Application.onCreate
CallxPlugin.bootstrap(this, CallxBootstrapConfig(accountGeneration = currentAccount()))
```

```swift
// iOS: application(_:didFinishLaunchingWithOptions:)
var config = CallxBootstrapConfig()
config.accountGeneration = currentAccount()
try CallxPlugin.bootstrap(config)
```

On Android, forward FCM messages from your `FirebaseMessagingService` to
`CallxBootstrap.started?.ingress?.handlePush(...)`. The
[Flutter quick start](https://bear-block.github.io/callx/guide/flutter) shows every file.

## Use it

```dart
import 'package:callx/callx.dart';

final callx = Callx();

Future<void> start() async {
  final capabilities = await callx.setup();
  if (!capabilities.nativeCalling) return;

  // Send this to your backend so it can push invitations to this device.
  final token = await callx.pushToken(); // voip on iOS, fcm on Android

  callx.snapshots.listen((snapshot) {
    final call = snapshot.call; // incoming, connecting, active, held, ended…
  });
}

Future<void> answer(String callId) async {
  final result = await callx.answer(callId);
  if (result.status != CommandStatus.applied) print(result.error?.message);
}
```

Your backend sends an APNs VoIP push or an FCM data message with a `callx` invitation; the
[backend guide](https://bear-block.github.io/callx/guides/backend) has the exact payloads.

## Try it without a backend

```dart
import 'package:callx/callx_preview.dart';

final preview = CallxPreview();
await preview.callx.setup();
await preview.simulator.incoming(
  const CallInput(callId: 'demo-1', displayName: 'Alex', handle: 'callx:alex'));
await preview.callx.answer('demo-1'); // connecting
await preview.simulator.mediaConnected(); // active
```

The simulator is an explicit opt-in; `Callx()` never falls back to it.

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
