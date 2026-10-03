---
title: "Migration rollout and rollback"
description: "Move call ownership and backend routing safely from an existing call integration to Callx."
---

# Migration rollout and rollback

Use this with the [CallKeep](/guides/migrate-callkeep) or
[flutter_callkit_incoming](/guides/migrate-flutter-callkit-incoming) mapping. Migration changes
native lifecycle ownership, backend signaling and media startup as well as framework code.
Keep the existing media provider unless you deliberately choose a separate media migration.

## Audit the current call path

Record the file responsible for each task before changing it:

| Task | What to find | Callx destination |
|---|---|---|
| Push registration | Which installation/user owns each token; refresh and sign-out handling | Backend installation registration plus native push setup |
| Incoming reporting | Native push hooks, background handlers and foreground incoming screens | Native ingress; one coordinated incoming presenter |
| Call identity | Backend ID, UI ID, room ID and remote end lookup | One stable call ID across signaling, native commands and media mapping |
| System actions | Answer, decline, hang-up, mute/hold handlers | Native callbacks and typed commands; framework observes snapshots |
| Media | All places that join/leave a room | One adapter or native host-controlled media owner |
| Recovery | Saved booleans, deferred events and reconnect decisions | Native snapshots/replay and backend reconciliation |
| Backend | Accepted/cancelled/ended messages, retries and expiry | Authenticated signaling to ingress with idempotent backend handling |

List unsupported requirements before replacing the stack: Callx currently allows one live
call; caller-display updates and several provider adapters are still planned. Check
[status](/project/status) and [roadmap](/project/roadmap), not just an API-name match.

## Prepare the backend first

Add your own installation-level integration marker to backend registration, for example
`legacy` or `callx`. This is application metadata you implement, not a Callx payload field.
Keep token platform, account and app version alongside it.

Route **one invitation format per installation**. An old installation receives the old payload;
a migrated installation receives the Callx payload. Do not send both reporting paths to the
same installation: two native presenters can compete for one invitation. Token refresh,
sign-out and app upgrades must refresh this routing information.

Preserve backend call IDs and terminal reasons. Repeated answer/end callbacks or network
retries must not create another call or join another room. Implement backend retry and
idempotency; a native committed action alone does not guarantee successful network delivery.

**Check:** old clients still ring and migrated clients receive only Callx invitations. A cancel
that arrives before its invitation remains cancelled on the migrated installation.

## Replace ownership in a development build

1. Finish the relevant framework quick start and native bootstrap.
2. Remove the old native presenter/push reporting hooks from the migrated build. Keep unrelated
   chat notifications and other Firebase consumers; forward non-call messages to their owner.
3. Connect native answer/end work to the backend and wire media to one adapter/native owner.
4. Replace framework event-based call state with snapshots. Use replay for durable event
   consumption rather than reproducing the old deferred-event queue.
5. Keep Home until acceptance, then show the accepted-call screen. Reopening the screen after
   recovery must not call Answer or join media again.
6. Register this build's installation for the new backend route only after its native setup works.

Do not switch call stacks halfway through a live call. Package removal and native configuration
require a rebuilt binary; a remote UI flag cannot install a missing native implementation.

## Validate old and new clients together

| Trial | Expected result |
|---|---|
| New caller → old receiver; old caller → new receiver | Backend routes each installation correctly; call IDs and end signals still match |
| Foreground incoming | One incoming presenter; accepted-call overlay opens only after acceptance |
| Background/terminated-runtime answer | Native acceptance and media startup work before framework UI loads |
| Remote cancel, expiry, duplicate invite | No late second ring; terminal reason is retained |
| Answer followed by reload/process death | UI restores native state; no duplicate acceptance or media join |
| Sign-out/token refresh/app upgrade | Push registration and account generation belong to the current account |
| Video/minimize/PiP | One media owner, correct camera policy, same call after expanding |

Use [the full device checklist](/guides/testing) and record the exact build/device/OS. Test
Android force-stop and vendor restrictions separately; iOS pushes require a physical iPhone.

## Roll out gradually

Start with internal users and a small cohort of installations. Observe delivery-to-ring,
answer-to-media connection, terminal cleanup and crash/recovery outcomes through your own
application/backend diagnostics. The library does not supply hosted analytics.

Keep old-format backend support until supported old app versions have aged out. Separate
presentation rollout from provider replacement so failures can be attributed to one change.

## Roll back with matching client support

Stop enrolling new installations and keep routing existing builds to the stack actually inside
them. Routing a Callx-only binary to a legacy payload will not restore the old SDK.

If the binary intentionally includes a tested legacy fallback, select its owner before a call
and update backend registration together. Otherwise rollback needs a rebuilt app release.
Drain live calls before switching owners. Verify token routing, single presenter and media
cleanup again after rollback; retain both backend formats while mixed versions remain active.
