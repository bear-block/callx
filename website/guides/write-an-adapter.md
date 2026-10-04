---
title: "Write a media adapter"
description: "Package a media provider as a Callx adapter that installs with no host code, on Android and iOS, and passes the conformance suite."
---

# Write a media adapter

A media adapter makes a provider work with Callx by installing one package. This guide shows the
interface, how discovery works, and the rules an adapter must follow. The LiveKit adapter in the
repository (`adapters/livekit`) is the reference implementation.

## Package layout

| Package | Depends on |
|---|---|
| `@your-scope/callx-<provider>` (npm) | `@bear-block/callx` as a peer, the provider's native SDK |
| `callx_<provider>` (pub.dev) | `callx`, the provider's native SDK |

Keep the native code in one canonical place and vendor it into both packages, as the LiveKit
adapter does, so Flutter and React Native behave identically. Depend on the core with a caret
range of the same major version.

## Android

### Implement the adapter

```kotlin
class ExampleMediaAdapter(private val ctx: CallxAdapterContext) : CallxMediaAdapter {
    override val apiVersion = 1

    override fun start(callId: String, sink: CallxMediaSink) {
        ctx.scope.launch {
            val credentials = credentialsFor(callId) ?: return@launch
            room.connect(credentials,
                onRemoteAudio = sink::connected,
                onReconnecting = sink::interrupted)
        }
    }

    override fun stop(callId: String) { room.disconnect(callId) }   // idempotent

    override suspend fun setMuted(callId: String, muted: Boolean): Boolean =
        room.setMicrophoneMuted(muted)
}
```

### Declare a factory

```kotlin
class ExampleAdapterFactory : CallxMediaAdapterFactory {   // public no-argument constructor
    override fun create(context: CallxAdapterContext): CallxMediaAdapter = ExampleMediaAdapter(context)
}
```

```xml
<!-- The adapter library's AndroidManifest.xml -->
<application>
    <meta-data android:name="dev.callx.media.example"
               android:value="com.example.callx.ExampleAdapterFactory" />
</application>
```

The key is `dev.callx.media.` plus your provider name, so two adapters never collide in the
merged manifest. The bootstrap finds it; the host writes nothing.

## iOS

### Implement the adapter

```swift
final class ExampleMediaAdapter: CallxMediaAdapter {
    func start(callID: String, sink: any CallxMediaSink) {
        Task { try await room.connect(callID: callID,
                                      onRemoteAudio: sink.connected,
                                      onReconnecting: sink.interrupted) }
    }
    func stop(callID: String) { room.disconnect(callID: callID) }
    func setMuted(callID: String, muted: Bool) async -> Bool { await room.setMicrophoneMuted(muted) }

    // CallKit owns the audio session: run the audio engine only inside this window.
    func didActivate(_ session: AVAudioSession) { room.enableAudioEngine() }
    func didDeactivate(_ session: AVAudioSession) { room.disableAudioEngine() }
}
```

`apiVersion` has a default implementation that returns the version your adapter was compiled
against.

### Declare a factory

```swift
@objc(ExampleCallxAdapterFactory)
public final class ExampleCallxAdapterFactory: NSObject, CallxMediaAdapterFactory {
    public required override init() {}
    public func makeAdapter(context: CallxAdapterContext) throws -> any CallxMediaAdapter {
        ExampleMediaAdapter()
    }
}
```

Hosts list the class name in `Info.plist` under `CallxMediaAdapterFactories`; your Expo config
plugin should add it for them. Give the class a stable Objective-C name with `@objc(…)`.

## Video

An adapter that carries video implements `CallxVideoAdapter` (adapter API 2) instead; audio-only
adapters stay at API 1 and keep working. See [video calls](/guide/video) and ADR-0010.

```kotlin
class ExampleMediaAdapter(private val ctx: CallxAdapterContext) : CallxVideoAdapter {   // apiVersion 2
    // start, stop and setMuted as above, plus:

    override suspend fun setCamera(callId: String, on: Boolean, facing: CameraFacing): CallxCameraError? {
        if (on && !cameraAllowed()) return CallxCameraError.permissionDenied
        room.publishCamera(on, facing)          // also switches the camera while it is on
        return null                             // applied
    }

    override fun attach(callId: String, source: VideoSource, surface: CallxVideoSurface) {
        // Add your renderer to surface.container (a TextureView, so Flutter can show it), honour
        // surface.fit and surface.mirror, and feed it the local or remote track once it exists.
    }

    override fun detach(callId: String, surface: CallxVideoSurface) { /* remove the renderer */ }
}
```

The Swift protocol has the same members; `attach` and `detach` run on the main actor and the
container is a `UIView`. Report video through the sink:

- `sink.videoChanged(remoteVideo = true)` when a remote video track is subscribed, and `false`
  when it goes.
- `sink.videoChanged(localVideo = LocalVideo.blocked)` when the OS takes the camera (the app went
  to the background), and `LocalVideo.on` when you resumed it. You cannot turn the camera on or
  off through the sink; that is always a command.

The core checks that the app is in front before asking for the camera, maps your error to
`permissionDenied`, `mediaNotReady` or `platformRejected`, and keeps CallKit's `hasVideo` in step.

## Keypad tones (optional)

Implement the DTMF interface next to the media adapter to report the `dtmf` capability; no
adapter API version change is needed, and adapters without it keep working (`sendDtmf` is then
rejected as `unsupported`). The core calls it for `sendDtmf` and, on iOS, for the CallKit keypad.

```kotlin
class ExampleMediaAdapter(/* … */) : CallxMediaAdapter, CallxDtmfAdapter {
    // Digits are 0-9, * and #. Return false when media is not ready (mediaNotReady).
    override suspend fun sendDtmf(callId: String, digits: String): Boolean = provider.sendTones(digits)
}
```

```swift
final class ExampleMediaAdapter: CallxMediaAdapter, CallxDTMFAdapter {
    func sendDTMF(callID: String, digits: String) async -> Bool { await provider.sendTones(digits) }
}
```

Return true only once every digit was handed to the provider. Tones never change call state.

## Rules

1. **Never report to the OS.** Turn off any CallKit, ConnectionService or Telecom integration in
   the provider SDK.
2. **Never decide call state.** A dropped connection is `interrupted()`, not an end. Do not call
   any end or hold API.
3. **Readiness means remote media.** Call `connected()` when the other party's audio arrives,
   and again after each recovery.
4. **Respect audio ownership.** iOS: no automatic `AVAudioSession` configuration, audio engine
   only between `didActivate` and `didDeactivate`. Android: no route manager of your own, voice
   call audio attributes.
5. **Return immediately** from `start` and `stop`; they run under the ingress lock. `stop` is
   idempotent and may arrive for a call that never started.
6. **Degrade without the microphone permission** to listen-only rather than failing.
7. **Store credentials safely**: Android Keystore, iOS keychain with
   `kSecAttrAccessibleAfterFirstUnlock`, so killed-app answers on a locked phone still work.

## Conformance

Every adapter passes the Android conformance scenario before release:

```sh
npx -p @bear-block/callx-testkit callx-conformance android
```

It invites the device through FCM, answers from the notification, checks that media connects,
drops the caller to check `mediaInterrupted`, brings them back, ends the call remotely and checks
logcat for crashes. See [test on devices](/guides/testing).

Tell us about your adapter in a [GitHub discussion](https://github.com/bear-block/callx/discussions)
so we can list it.
