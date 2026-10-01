---
title: "Bring your own media"
description: "Connect any media engine (WebRTC, Agora, Twilio Video, Daily, your own SFU) to Callx calls from native callbacks or from Dart and JavaScript."
---

# Bring your own media

The Callx core has no media dependency. Any engine works: plain WebRTC, Agora, Twilio Video,
Daily, Vonage, a SIP stack or your own SFU. You start media when the call is answered, stop it
when it ends, and tell Callx when audio actually flows.

There are three ways to do it. Pick the first one that fits.

| Approach | Audio from a killed app | Effort |
|---|---|---|
| [Install an adapter](#install-an-adapter) | Yes | Configuration only |
| [Native callbacks](#native-callbacks) | Yes | Native code in your host |
| [Dart or JavaScript](#dart-or-javascript) | After the engine loads | Framework code |

## Install an adapter

If an adapter exists for your provider, use it: [LiveKit](/guide/livekit) today, others on the
[roadmap](/project/roadmap). If not, consider [writing one](/guides/write-an-adapter); a native
adapter is reusable across your apps and both frameworks.

## Native callbacks

Your host passes a listener to the bootstrap and drives media from it.

::: code-group

```kotlin [Android]
class MediaListener(private val engine: MyMediaEngine) : TelecomIngressListener {
    override fun onCallAnswered(callId: String) {
        // Runs under the ingress lock: start asynchronously and return.
        engine.joinAsync(callId,
            onRemoteAudio = { CallxBootstrap.started?.runtime?.mediaConnected(callId) },
            onReconnecting = { CallxBootstrap.started?.runtime?.mediaInterrupted(callId) })
    }
    override fun onCallEnded(callId: String) = engine.leave(callId)
}

CallxPlugin.bootstrap(this, CallxBootstrapConfig(
    listener = MediaListener(engine),
    muteController = engine,      // implements MediaMuteController.setMuted
    discoverMedia = false,
))
```

```swift [iOS]
final class MediaListener: CallKitIngressListener {
    func callAnswered(callID: String) {
        engine.prepare(callID: callID)   // connect signaling, but do not start audio yet
    }
    func callEnded(callID: String) { engine.leave(callID: callID) }
    // …other callbacks
}

final class MediaAudio: CallKitAudioSessionHandling {
    func didActivate(_ session: AVAudioSession) { engine.startAudio() }    // CallKit says go
    func didDeactivate(_ session: AVAudioSession) { engine.stopAudio() }
}

var config = CallxBootstrapConfig()
config.listener = MediaListener()
config.audio = MediaAudio()
config.discoverMedia = false
let started = try CallxPlugin.bootstrap(config)
// When remote audio arrives: try await started.runtime.mediaConnected(callID: id)
```

:::

### Rules

- **Report readiness only when remote audio arrives**, not when the answer succeeds or a room is
  joined. That is what moves the call to `active`.
- **Map reconnecting events to `mediaInterrupted`**, never to a hold or an end. If media does not
  return, end the call through your backend.
- **iOS**: turn off your engine's automatic audio session handling. Start audio in
  `didActivate`, stop it in `didDeactivate`. Never call `setActive(true)` yourself.
- **Android**: turn off your engine's audio route manager (for example WebRTC's AudioSwitch).
  Route through `ingress.requestAudioEndpoint`, and play audio on `STREAM_VOICE_CALL`.
- **Mute**: on Android, Telecom has no mute setter, so Callx applies mute from any surface
  through your `MediaMuteController`. On iOS, CallKit mute actions reach your performer.

## Dart or JavaScript

When your media SDK lives in Dart or JavaScript, for example because you render video tiles,
connect it when the call reaches `connecting`, and report readiness from the framework side
through your native host.

```ts
callx.observe(({call}) => {
  if (call?.state === 'connecting' && !media.joined(call.callId)) {
    media.join(call.callId);
  }
  if (call?.state === 'ended') media.leave(call?.callId);
});
```

Trade-off: when a call is answered from the lock screen with the app killed, audio waits until
the engine has loaded. For voice-first apps, native media is the better experience.

::: warning One audio owner
If your framework-level SDK integrates with CallKit or Telecom on its own (some SDKs offer a
"CallKit mode"), turn that off. Callx must be the only component that reports calls to the OS.
:::
