---
title: "Production checklist"
description: "Push credentials, token hygiene, retention, monitoring and privacy for a Callx backend in production."
---

# Production checklist

The rules behind these items are on the [backend overview](/backend/).

## Push credentials and tokens

- [ ] **APNs**: token-based authentication (a `.p8` key) on the server only; topic
      `<bundle id>.voip`; `apns-push-type: voip`; priority 10; `apns-expiration: 0`.
- [ ] Store the **APNs environment** with each VoIP token and send development builds to
      `api.sandbox.push.apple.com`. A sandbox token sent to production fails with
      `BadDeviceToken`.
- [ ] **FCM**: HTTP v1 with a service account on the server only; `priority: HIGH`, no
      `notification` block, `ttl` = seconds until `expiresAtMs`.
- [ ] Delete tokens the providers reject: APNs `410 Unregistered` or `BadDeviceToken`, FCM
      `UNREGISTERED` (404). **Why:** stale tokens ring nobody and waste delivery budget.
- [ ] Re-upload tokens on every app launch and when they rotate; bind them to the signed-in
      user and installation; remove them on sign-out.

## Correctness

- [ ] Fresh UUID per call; idempotent create, answer and end by `operationId`.
- [ ] Atomic answer winner; `answeredElsewhere` to the other devices.
- [ ] Server timer ends ringing calls at `expiresAtMs` as `unanswered`.
- [ ] Transactional outbox for every push and event, delivered at least once with `eventId`
      and `revision`.
- [ ] Do not send invitations that are already expired, cancelled or busy. **Why:** iOS still
      makes Callx report them, and FCM deprioritizes high-priority messages that show nothing.

## Timing and clocks

- [ ] Keep the invitation lifetime between 30 and 45 seconds. Callx's own ring deadline is
      45 seconds and is capped by `expiresAtMs`.
- [ ] Set `expiresAtMs` from the server clock. Phones compare it with their own clock, so a
      phone set minutes behind or ahead treats invitations as early or expired; a generous
      lifetime absorbs normal drift.

## Retention

| Record | Keep at least | Why |
|---|---|---|
| Ended calls (tombstones) | Invitation lifetime plus your longest retry window | A late answer or retried create gets the real outcome |
| Idempotency results | Your client retry window (Callx keeps its own operation results 24 hours) | A retry after reconnect returns the first outcome |
| Event history for replay | Your typical offline period | Reconnecting phones catch up instead of resynchronizing |

## Monitoring

Measure each step separately; a success at one step says nothing about the next:

| Step | Signal |
|---|---|
| Push accepted by APNs or FCM | Provider HTTP response |
| Push received on the phone | `onPushReceived` (Android); compare `priority` with `originalPriority` to spot FCM deprioritizing |
| Call rang | `onInvitationAccepted` / `invitationAccepted` |
| Not rung, and why | `onInvitationRejected` / `invitationRejected` outcome (`Duplicate`, `Busy`, `Expired`, `Ended`) |
| Answered and won | Your answer endpoint |
| Media connected | The call reaching `active` on both phones |

Report these from the native listeners with the call ID, never with tokens or payloads.

## Privacy

- `displayName` and `handle` travel through Apple or Google and are stored in the phone's call
  history (iOS Recents, Android notifications). Send only what the user would see anyway.
- Never put media credentials, session tokens or phone numbers you do not show in a push.
- Do not log push tokens or full payloads.

## Test it

The [testkit](/guides/testing) plays the caller: it sends real FCM pushes, serves LiveKit
tokens and joins calls from a browser, so you can check each flow in
[call flows](/backend/call-flows) on real devices before your backend is finished.
