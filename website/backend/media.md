---
title: "Media credentials"
description: "The token endpoint the LiveKit adapter calls, who may get a token, and how the token request can claim the answer."
---

# Media credentials

Callx carries no media. The media adapter joins your provider's room when a call is answered,
with credentials your backend issues. This page describes that endpoint for the LiveKit
adapter; other adapters follow the same rules.

## The LiveKit token endpoint

Configure the adapter once with your URL and the headers that authenticate the device
(`CallxLiveKit.configure(tokenUrl, headers)`; see [LiveKit](/guide/livekit)). When a call is
answered, the adapter calls it natively:

```http
POST /v1/media-token HTTP/1.1
authorization: Bearer DEVICE_SESSION_TOKEN
x-installation-id: installation-b1
content-type: application/json

{"callId": "85a4fd88-b5c3-4f79-a2cf-a7db9df06750"}
```

Answer with the room's URL and a token for this participant:

```json
{"url": "wss://livekit.example.com", "token": "eyJhbGciOi…"}
```

Any non-2xx status, or a body without `url` and `token`, fails the media start: the call stays
`connecting` and never becomes `active`.

| Rule | Why |
|---|---|
| Authenticate from the headers, never from the body | The body only names the call; anyone can type a call ID |
| Issue a token only to the caller and the answer winner | Devices that lost the answer must not join the room |
| Derive the room from the call, for example `call-<callId>` | One room per call keeps calls apart and makes cleanup simple |
| Use a stable identity per user and installation | The other side can tell devices apart, and a reconnect replaces the old participant |
| Keep tokens short-lived (minutes) | A token is only needed to connect; a leaked one should expire before it is useful |
| Grant publish and subscribe for audio, and video only for video calls | Least privilege; the call type is already on the server |

**Why the request is native:** the user can answer from the lock screen of a killed app. The
adapter fetches the token and connects before any Dart or JavaScript runs, so the stored
headers must be enough to authenticate. If your session tokens expire, use
`CallxLiveKit.setCredentialProvider` with native code that refreshes them, and call
`CallxLiveKit.reset` on sign-out so the next user cannot join with the previous user's
headers.

## Let the token request claim the answer

The callee's adapter asks for a token right after the user answers. You can treat that request
as the answer itself:

1. If the call is ringing and unexpired, make this installation the winner in one
   transaction, send `call.accepted` to the caller and `call.ended` (`answeredElsewhere`) to
   the callee's other devices, and return the token.
2. If this installation already won (a retry), return a new token.
3. If another installation won, return `409`. That device's media does not start; the
   `call.ended` event ends it with the right reason.
4. If the call ended or expired, return `410`; the phone gets `call.ended` too.

The caller's own token request only checks that the call is accepted.

**Why:** the answer and the token are one decision. Doing them in one request removes a race
(answer accepted, token refused, or the reverse) and saves a round trip on the slowest moment
of a call. It needs the installation in the headers (as above), because several devices of
the same user share a session. If you prefer a separate `POST /answer`, call it from
`onCallAnswered` / `callAnswered` and have the token endpoint check the stored winner.

## Keypad tones need a SIP participant

`sendDtmf` makes the LiveKit adapter publish SIP DTMF packets in the room. They reach a phone
line or IVR only if the room has a LiveKit SIP participant; between two app users nobody plays
them. See [phone features](/guide/phone-features#keypad-tones).

## Your own media

With your own adapter or [your own media engine](/guides/own-media), keep the same contract:
fetch credentials natively when the call is answered, authorize against the call on the
server, and report `mediaConnected` only when audio actually flows.
