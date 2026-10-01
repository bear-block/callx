---
title: "Media and audio ownership"
description: "How Callx coordinates media without carrying it, who owns the audio session and routing, and how adapters plug in."
---

# Media and audio ownership

Callx never carries audio. It coordinates the media engine you choose so that the phone call and
the audio agree: media starts when the call is answered, stops when it ends, and the OS stays in
charge of the audio session and routing.

Most "no audio" bugs in call apps come from two subsystems fighting over the audio session: the
call framework and the media SDK each activate, configure or route audio on their own. Callx
assigns every concern a single owner.

## Who owns what

| Concern | Owner |
|---|---|
| iOS audio session activation | CallKit. Media starts in `didActivate`, stops in `didDeactivate` |
| Android audio routing (speaker, earpiece, Bluetooth) | Telecom, through its endpoint API |
| Capture, playback, encoding, track mute | The media SDK, through the adapter |
| When media starts and stops | The Callx ingress, once per call, from any surface |
| Whether the call is `active` | The coordinator, when media reports it flows |

Two consequences:

- **iOS**: never call `AVAudioSession.setActive(true)` yourself for a call. CallKit activates the
  session after the answer completes, including on the lock screen. Start audio in `didActivate`.
- **Android**: never call `AudioManager.setCommunicationDevice` or `startBluetoothSco`, and turn off
  your media SDK's own route manager. Use `ingress.requestAudioEndpoint` and
  `onAudioEndpointsChanged`. Play call audio on `STREAM_VOICE_CALL`.

## Three ways to provide media

### 1. Install an adapter

An adapter package implements Callx's media interface for one provider. The bootstrap discovers
it and starts it for every answered call. You configure credentials and write no native code.
[LiveKit](/guide/livekit) is available today.

### 2. Run media from the native callbacks

Keep your media code in your native host and drive it from the ingress listener:

| Event | Android (`TelecomIngressListener`) | iOS (`CallKitIngressListener`) |
|---|---|---|
| Answered, from any surface | `onCallAnswered(callId)` | `callAnswered(callID:)` |
| Ended, for any reason | `onCallEnded(callId)` | `callEnded(callID:)` |

Then report readiness: `runtime.mediaConnected(callId)` when remote audio arrives and
`runtime.mediaInterrupted(callId)` when it drops. See [bring your own media](/guides/own-media).

### 3. Run media from Dart or JavaScript

If your media SDK lives in Dart or JavaScript (for example to render video), connect it when the
call reaches `connecting`. Be aware that answering from the lock screen may happen before your
engine has loaded; audio then starts when it does. For voice calls that must work from a killed
app, prefer options 1 or 2.

## The media adapter interface

```kotlin
interface CallxMediaAdapter : MediaMuteController {
    val apiVersion: Int                               // 1
    fun start(callId: String, sink: CallxMediaSink)   // answered, from any surface
    fun stop(callId: String)                          // ended, for any reason
}

interface CallxMediaSink {
    fun connected()     // remote media flows   → call becomes active
    fun interrupted()   // connected media dropped → mediaInterrupted = true
}
```

On iOS the protocol has the same shape and also receives CallKit's `didActivate` and
`didDeactivate`. [Write your own adapter →](/guides/write-an-adapter)

## Rules every adapter follows

- **Media never decides call state.** A dropped room is an interruption, not a hang-up. Your
  backend ends calls through signaling.
- **Adapters never report to the OS.** Provider features that integrate with CallKit or Telecom
  themselves stay off.
- **One media adapter.** Installing two is refused at bootstrap.
- **Missing microphone permission degrades to listen-only** rather than failing the call.
