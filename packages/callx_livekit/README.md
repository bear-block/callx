# callx_livekit

LiveKit media adapter for [callx](../callx/README.md). When a call is answered, from the app,
the lock screen, a watch or a car, the adapter joins the call's LiveKit room natively, so audio
starts even if Dart is not running yet
([ADR-0009](https://bear-block.github.io/callx/project/decisions)).

Voice calls only. If your app renders video or participants with `livekit_client`, use callx
alone and connect LiveKit yourself when the call is answered.

## Install

```sh
flutter pub add callx callx_livekit
```

```yaml
# pubspec.yaml
flutter:
  config:
    # LiveKit's Swift SDK ships only through Swift Package Manager.
    enable-swift-package-manager: true
```

iOS: add the adapter to `Info.plist` so callx's bootstrap finds it:

```xml
<key>CallxMediaAdapterFactories</key>
<array>
  <string>CallxLiveKitAdapterFactory</string>
</array>
```

Android: add JitPack to the app's repositories (LiveKit's AudioSwitch dependency); the adapter
declares itself in its manifest:

```kotlin
maven("https://jitpack.io") { content { includeGroup("com.github.davidliu") } }
```

`CallxPlugin.bootstrap` finds the adapter; there is no native code to write.

## Configure credentials

```dart
import 'package:callx_livekit/callx_livekit.dart';

// After sign-in, and whenever the session token changes. It persists, so a call answered
// while the app was killed still gets credentials. Headers are stored encrypted.
await CallxLiveKit.configure(LiveKitConfig(
  tokenUrl: 'https://api.example.com/calls/livekit-token',
  headers: {'authorization': 'Bearer $sessionToken'},
));

// On sign-out.
await CallxLiveKit.reset();
```

Your backend receives `POST tokenUrl` with those headers and `{"callId": "..."}`. It
authenticates the user, checks that they belong to the call, and answers
`{"url": "wss://your-livekit-host", "token": "<LiveKit access token for room call-<callId>>"}`.

## What the adapter does

- One LiveKit room per call, joined on answer and left when the call ends.
- Reports `mediaReady` when the other party's audio arrives and `mediaInterrupted` while
  LiveKit reconnects or no remote audio is heard; it never ends or holds the call.
- Android: Telecom owns audio routing (LiveKit's AudioSwitch is off). iOS: CallKit owns the
  audio session; LiveKit's engine runs only between `didActivate` and `didDeactivate`.
- Without the microphone permission the call stays connected and only listens.
