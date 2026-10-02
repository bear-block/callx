---
title: "Add LiveKit audio"
description: "Real two-way call audio with LiveKit, joined natively on answer, with one package and no native code."
---

# Add LiveKit audio

The LiveKit adapter gives every call real two-way audio through a
[LiveKit](https://livekit.io) room. Installing it is the whole integration: Callx's bootstrap
discovers it, and when a call is answered, from your app, the lock screen, a watch or a car,
the adapter joins the call's room natively. Audio starts even if Dart or JavaScript has not
loaded yet.

::: info Audio and video
The adapter carries audio, and from version 0.2 one-to-one video too: see
[video calls](/guide/video). If your app needs LiveKit features beyond that, such as screen
sharing or many participant tiles, use Callx alone and
[connect LiveKit yourself](/guides/own-media) when the call is answered.
:::

## Install

::: code-group

```sh [React Native]
npm install @bear-block/callx-livekit
cd ios && pod install
```

```sh [Expo]
npx expo install @bear-block/callx-livekit
# then add "@bear-block/callx-livekit/app.plugin" after Callx's plugin and prebuild
```

```sh [Flutter]
flutter pub add callx_livekit
```

:::

### Platform setup

**Android** (React Native CLI and Flutter): LiveKit's audio routing library comes from JitPack.
Add it to the app's repositories:

::: code-group

```kotlin [settings.gradle.kts]
dependencyResolutionManagement {
    repositories {
        maven("https://jitpack.io") { content { includeGroup("com.github.davidliu") } }
    }
}
```

```groovy [build.gradle]
allprojects {
    repositories {
        maven { url "https://jitpack.io"; content { includeGroup "com.github.davidliu" } }
    }
}
```

:::

The adapter declares itself in its Android manifest; there is nothing else to register.

**iOS** (React Native CLI and Flutter): list the adapter in `Info.plist` so the bootstrap finds
it:

```xml
<key>CallxMediaAdapterFactories</key>
<array>
  <string>CallxLiveKitAdapterFactory</string>
</array>
```

**Flutter on iOS**: LiveKit's Swift SDK ships only through Swift Package Manager. Enable it in
`pubspec.yaml`:

```yaml
flutter:
  config:
    enable-swift-package-manager: true
```

With Expo, the adapter's plugin adds the `Info.plist` entry, and Expo's Android template already
includes JitPack. There is nothing to do by hand.

## Configure credentials

The adapter asks your backend for room credentials when a call is answered. Tell it where,
after sign-in and whenever your session token changes. The configuration persists, so a call
answered while the app was killed still gets credentials. Headers are stored encrypted (Android
Keystore, iOS keychain).

::: code-group

```ts [React Native]
import {configureLiveKit, resetLiveKit} from '@bear-block/callx-livekit';

await configureLiveKit({
  tokenUrl: 'https://api.acme.com/calls/livekit-token',
  headers: {authorization: `Bearer ${sessionToken}`},
});

// On sign-out:
await resetLiveKit();
```

```dart [Flutter]
import 'package:callx_livekit/callx_livekit.dart';

await CallxLiveKit.configure(LiveKitConfig(
  tokenUrl: 'https://api.acme.com/calls/livekit-token',
  headers: {'authorization': 'Bearer $sessionToken'},
));

// On sign-out:
await CallxLiveKit.reset();
```

:::

### Your token endpoint

When a call is answered, the adapter sends:

```http
POST /calls/livekit-token
authorization: Bearer <session token>
content-type: application/json

{"callId": "85a4fd88-b5c3-4f79-a2cf-a7db9df06750"}
```

Your backend authenticates the user, checks that they belong to that call, and answers:

```json
{"url": "wss://livekit.acme.com", "token": "<LiveKit access token>"}
```

Issue a short-lived token for the room `call-<callId>` with permission to publish and
subscribe audio. A minimal Node.js handler:

```ts
import {AccessToken} from 'livekit-server-sdk';

app.post('/calls/livekit-token', requireUser, async (req, res) => {
  const {callId} = req.body;
  if (!(await calls.isParticipant(callId, req.user.id))) return res.sendStatus(403);
  const token = new AccessToken(process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET, {
    identity: req.user.id,
    ttl: '10m',
  });
  token.addGrant({room: `call-${callId}`, roomJoin: true, canPublish: true, canSubscribe: true});
  res.json({url: process.env.LIVEKIT_URL, token: await token.toJwt()});
});
```

### Credentials from native code

Hosts that already hold credentials natively can register a provider before the bootstrap
instead of a token URL:

::: code-group

```kotlin [Android]
CallxLiveKit.setCredentialProvider { callId -> LiveKitCredentials(url, token) }
```

```swift [iOS]
CallxLiveKit.setCredentialProvider { callID in LiveKitCredentials(url: url, token: token) }
```

:::

## What the adapter does

- Joins one LiveKit room per call when the call is answered, and leaves when it ends, whatever
  ended it.
- Reports media as connected when the other party's audio arrives; the call becomes `active`.
- Reports `mediaInterrupted` while LiveKit reconnects or no remote audio is heard. Your UI can
  show "Reconnecting…". It never ends or holds the call.
- **Android**: Telecom owns audio routing (speaker, earpiece, Bluetooth). LiveKit's own routing
  is turned off, so the system call UI and your app agree.
- **iOS**: CallKit owns the audio session. The LiveKit engine runs only between CallKit's
  `didActivate` and `didDeactivate`, which avoids the classic "no audio after answering from
  the lock screen" problem.
- Without microphone permission the call stays connected in listen-only mode instead of
  failing.

## Run LiveKit locally

For development, run a LiveKit server in Docker with its development keys:

```sh
docker run --rm -p 7880:7880 -p 7881:7881 -p 7882:7882/udp \
  livekit/livekit-server --dev --bind 0.0.0.0
```

The [testkit](/guides/testing)'s call console issues tokens for this server and joins calls as
the caller from your browser, so you can talk to the phone without a second device.
