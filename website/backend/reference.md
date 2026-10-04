---
title: "API and push payloads"
description: "A complete reference design for the backend: data model, endpoints, signaling events, and the exact APNs VoIP and FCM invitation payloads."
---

# API and push payloads

A complete reference design you can implement in any language. The endpoint names are
suggestions; the push payloads are exactly what Callx decodes. Why the design looks like this
is on the [backend overview](/backend/); when each endpoint is called is in
[call flows](/backend/call-flows).

## What your backend does

| Responsibility | Notes |
|---|---|
| Authenticate users and devices | Derive identity from the session, never from JSON fields |
| Store push tokens per installation | iOS VoIP tokens and Android FCM tokens |
| Create calls | Unique `callId`, caller, callee, expiry |
| Send invitations | APNs VoIP push or FCM data message with a `callx` payload |
| Arbitrate answers | The first answering device wins; others get `answeredElsewhere` |
| Deliver call events | Accepted and ended, over your signaling connection |
| Issue media credentials | Short-lived, per participant, after authorization |

## Data model

Use a UUID as `callId` and never reuse it.

| Field | Meaning |
|---|---|
| `callId` | Globally unique call identity |
| `eventId` | Unique identity of each network event; devices deduplicate by it |
| `revision` | Per-call counter as a decimal string, incremented in the same transaction as each change |
| `operationId` | Idempotency key for one requested action |
| `installationId` | One app installation; not a credential |

Store per call: participants, state (`ringing`, `accepted`, `ended`), the winning installation,
created, expiry and ended timestamps, the end reason and the last revision. Keep ended calls
long enough that a delayed invitation cannot resurrect them.

## Endpoints

All over authenticated HTTPS. Authorize call membership on every request.

| Method and route | Request | Response |
|---|---|---|
| `PUT /v1/installations/{id}/push-tokens/{kind}` | Token, app ID, APNs environment | Saved registration |
| `DELETE /v1/installations/{id}/push-tokens/{kind}` | | No content |
| `POST /v1/calls` | `callId`, `calleeUserId`, `operationId` | Call snapshot |
| `POST /v1/calls/{id}/answer` | `operationId`, `installationId`, `expectedRevision` | Winner snapshot, or conflict |
| `POST /v1/calls/{id}/end` | `operationId`, `reason` | Terminal snapshot |
| `GET /v1/calls/{id}` | | Current snapshot, including ended calls |
| `POST /v1/calls/{id}/media-session` | | Short-lived media credentials |
| `GET /v1/call-events?cursor=…` | | Events and next cursor, or an explicit gap |

`kind` is `apnsVoip` or `fcm`, matching the `type` that `getPushToken()` returns (`voip` or
`fcm`).

A call snapshot:

```json
{
  "schemaVersion": 1,
  "callId": "85a4fd88-b5c3-4f79-a2cf-a7db9df06750",
  "revision": "1",
  "state": "ringing",
  "caller": {"userId": "user-a", "displayName": "Alex", "handle": "callx:user-a"},
  "calleeUserId": "user-b",
  "createdAtMs": 1790000000000,
  "expiresAtMs": 1790000030000
}
```

### Idempotency and arbitration

- Make create, answer and end idempotent on (account, `operationId`, request fingerprint). A
  retry returns the original outcome; the same ID with a different payload returns a conflict.
- Select the answer winner atomically while the call is ringing and unexpired. Later answers
  receive the winner's snapshot and no media session.
- Write each call change and its delivery job in one transaction (a transactional outbox); a
  worker sends the pushes and events with retries.

Push provider acceptance means accepted for delivery, not delivered and not rung.

## iOS: APNs VoIP invitation

Send through the APNs HTTP/2 API to the device's VoIP token:

```http
POST /3/device/VOIP_DEVICE_TOKEN HTTP/2
host: api.push.apple.com
authorization: bearer APNS_PROVIDER_JWT
apns-push-type: voip
apns-topic: com.example.calls.voip
apns-priority: 10
apns-expiration: 0
content-type: application/json

{
  "aps": {},
  "callx": {
    "schemaVersion": 1,
    "eventId": "evt-invite-001",
    "type": "call.invited",
    "callId": "85a4fd88-b5c3-4f79-a2cf-a7db9df06750",
    "revision": "1",
    "displayName": "Alex",
    "handle": "callx:user-a",
    "issuedAtMs": 1790000000000,
    "expiresAtMs": 1790000030000
  }
}
```

- The topic is your bundle ID plus `.voip`. Use `api.sandbox.push.apple.com` for development
  builds.
- `apns-expiration: 0` asks APNs not to store the push for later; a call that cannot ring now
  should not ring in ten minutes.
- Send **only** invitations as VoIP pushes. Every VoIP push must produce a CallKit report; Callx
  makes one even for invitations that must not ring, but iOS penalizes apps that use VoIP pushes
  for anything else.

## Android: FCM invitation

Send through the FCM HTTP v1 API. FCM `data` values are strings, so the invitation is JSON in
one string:

```http
POST /v1/projects/FIREBASE_PROJECT_ID/messages:send HTTP/1.1
host: fcm.googleapis.com
authorization: Bearer GOOGLE_OAUTH_ACCESS_TOKEN
content-type: application/json

{
  "message": {
    "token": "ANDROID_FCM_TOKEN",
    "android": {"priority": "HIGH", "ttl": "30s"},
    "data": {
      "callx": "{\"schemaVersion\":1,\"eventId\":\"evt-invite-001\",\"type\":\"call.invited\",\"callId\":\"85a4fd88-b5c3-4f79-a2cf-a7db9df06750\",\"revision\":\"1\",\"displayName\":\"Alex\",\"handle\":\"callx:user-a\",\"issuedAtMs\":1790000000000,\"expiresAtMs\":1790000030000}"
    }
  }
}
```

- Use high priority and no `notification` block, so the app's code presents the call.
- Set `ttl` to the time left until `expiresAtMs`, in whole seconds. FCM then holds the
  invitation while the device's connection is down (after a reboot, in Doze, or during a
  network switch) and still delivers it in time; Callx ignores an invitation that arrives after
  it expires. Do not use `"0s"`: FCM drops a zero-TTL message whenever the device is not
  connected at that moment, and the call never rings.
- Do not send invitations you already know are expired, cancelled or busy. FCM can lower the
  priority of apps whose high-priority messages do not lead to a visible notification.
- Remove tokens FCM reports as invalid.

### The invitation fields

| Field | Required | Meaning |
|---|---|---|
| `schemaVersion` | Yes | `1` |
| `type` | Yes | `call.invited` |
| `callId` | Yes | The call's ID (UUID recommended); same format as any Callx ID |
| `displayName` | Yes | Shown on the incoming-call UI; 1–256 UTF-8 bytes |
| `handle` | Yes | Your app's address for the caller, for example `callx:user-a`; 1–256 bytes |
| `eventId` | No | Unique per message; recommended so hosts can deduplicate |
| `revision` | No | The call's revision when sent, as a decimal string |
| `issuedAtMs` | No | When the backend sent it |
| `expiresAtMs` | No | After this time the call does not ring; also caps the ring deadline |
| `video` | No | `true` rings as a video call: CallKit `hasVideo` and Core-Telecom's video call type. See [video calls](/guide/video) |

## Signaling events

Send `call.accepted` and `call.ended` over your authenticated signaling connection (a WebSocket
or your provider's channel), not as pushes:

```json
{
  "schemaVersion": 1,
  "eventId": "evt-answer-002",
  "type": "call.accepted",
  "callId": "85a4fd88-b5c3-4f79-a2cf-a7db9df06750",
  "revision": "2",
  "occurredAtMs": 1790000005000,
  "answeredByInstallationId": "installation-b1"
}
```

The native host deduplicates by `eventId` and per-call `revision`, then maps each event
([where these enter Callx](/backend/call-flows#where-signaling-events-enter-callx)):

| Observation | Host calls |
|---|---|
| Invitation over signaling while the app runs | `ingress.handleInvitation(invitation)` |
| The callee accepted your outgoing call | `ingress.remoteAnswered(callId)` |
| Another device of this user answered | `ingress.remoteEnded(callId, "answeredElsewhere")` |
| The caller cancelled before an answer | `ingress.remoteEnded(callId, "callerCancelled")` |
| The other party hung up | `ingress.remoteEnded(callId, "remoteEnded")` |
| Media actually flows | `runtime.mediaConnected(callId)` (adapters do this) |

Do not inject a second local answer for an answer this device made: the command already
committed it.

## Security checklist

- APNs keys and Firebase service accounts live on your server only.
- Media credentials are short-lived and fetched after authorization, never put in pushes
  ([media credentials](/backend/media)).
- Unregister or rebind push tokens on sign-out, so a signed-out user stops receiving calls.
- Do not log push tokens or full payloads.

## Test it end to end

1. Two signed builds, users A and B, tokens registered.
2. A creates a call; B receives the invitation and rings with the app killed.
3. B answers; A receives `call.accepted`; both sides reach `connecting`.
4. Media flows; both reach `active`.
5. A hangs up; B ends with `remoteEnded`.
6. Repeat with: cancel before answer, a duplicate invitation, two devices answering, network loss,
   the lock screen, an engine restart and expired credentials.

The [testkit](/guides/testing) can play user A for you.
