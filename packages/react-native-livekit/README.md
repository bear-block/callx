# @bear-block/callx-livekit

LiveKit media adapter for [`@bear-block/callx`](../react-native/README.md). When a call is
answered, from the app, the lock screen, a watch or a car, the adapter joins the call's LiveKit
room natively, so audio starts even if JavaScript is not running yet
([ADR-0009](https://bear-block.github.io/callx/project/decisions)).

Voice calls only. If your app renders video or participants with LiveKit's own React Native
SDK, use `@bear-block/callx` alone and connect LiveKit yourself when the call is answered.

## Install

```sh
npm install @bear-block/callx @bear-block/callx-livekit
```

Expo: add both config plugins, then prebuild.

```json
{
  "expo": {
    "plugins": ["@bear-block/callx/app.plugin", "@bear-block/callx-livekit/app.plugin"]
  }
}
```

React Native CLI: add `CallxLiveKitAdapterFactory` to the `CallxMediaAdapterFactories` array
in `Info.plist`, and JitPack to the Android repositories (LiveKit's AudioSwitch dependency):

```gradle
maven { url "https://jitpack.io"; content { includeGroup "com.github.davidliu" } }
```

Callx's native bootstrap (`CallxModule.bootstrap` on Android, `CallxReactNativeHost.bootstrap`
on iOS) finds the adapter; there is no native code to write. On iOS, LiveKit comes through
Swift Package Manager (React Native's `spm_dependency`).

## Configure credentials

```ts
import {configureLiveKit, resetLiveKit} from '@bear-block/callx-livekit';

// After sign-in, and whenever the session token changes. It persists, so a call answered
// while the app was killed still gets credentials. Headers are stored encrypted.
await configureLiveKit({
  tokenUrl: 'https://api.example.com/calls/livekit-token',
  headers: {authorization: `Bearer ${sessionToken}`},
});

// On sign-out.
await resetLiveKit();
```

Your backend receives `POST tokenUrl` with those headers and `{"callId": "..."}`. It
authenticates the user, checks that they belong to the call, and answers
`{"url": "wss://your-livekit-host", "token": "<LiveKit access token for room call-<callId>>"}`.

Hosts that already hold credentials natively can register a provider before bootstrap instead:
`CallxLiveKit.setCredentialProvider { callId -> LiveKitCredentials(url, token) }` (Kotlin) or
`CallxLiveKit.setCredentialProvider { callID in LiveKitCredentials(url:token:) }` (Swift).

## What the adapter does

- One LiveKit room per call, joined on answer and left when the call ends.
- Reports `mediaReady` when the other party's audio arrives and `mediaInterrupted` while
  LiveKit reconnects or no remote audio is heard; it never ends or holds the call.
- Android: Telecom owns audio routing (LiveKit's AudioSwitch is off). iOS: CallKit owns the
  audio session; LiveKit's engine runs only between `didActivate` and `didDeactivate`.
- Without the microphone permission the call stays connected and only listens.
