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
class AcmeMediaAdapter(private val ctx: CallxAdapterContext) : CallxMediaAdapter {
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
class AcmeAdapterFactory : CallxMediaAdapterFactory {   // public no-argument constructor
    override fun create(context: CallxAdapterContext): CallxMediaAdapter = AcmeMediaAdapter(context)
}
```

```xml
<!-- The adapter library's AndroidManifest.xml -->
<application>
    <meta-data android:name="dev.callx.media.acme"
               android:value="com.acme.callx.AcmeAdapterFactory" />
</application>
```

The key is `dev.callx.media.` plus your provider name, so two adapters never collide in the
merged manifest. The bootstrap finds it; the host writes nothing.

## iOS

### Implement the adapter

```swift
final class AcmeMediaAdapter: CallxMediaAdapter {
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
@objc(AcmeCallxAdapterFactory)
public final class AcmeCallxAdapterFactory: NSObject, CallxMediaAdapterFactory {
    public required override init() {}
    public func makeAdapter(context: CallxAdapterContext) throws -> any CallxMediaAdapter {
        AcmeMediaAdapter()
    }
}
```

Hosts list the class name in `Info.plist` under `CallxMediaAdapterFactories`; your Expo config
plugin should add it for them. Give the class a stable Objective-C name with `@objc(…)`.

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
