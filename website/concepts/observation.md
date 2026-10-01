---
title: "Observation and replay"
description: "Snapshots, observation sessions, replayed events and acknowledgement, so your UI never misses or invents a change."
---

# Observation and replay

Your UI learns about calls by observing the native core. There are two levels: a simple snapshot
stream for most apps, and explicit sessions with replay for apps that must process every event
exactly once, such as those that sync call history to a backend.

## Snapshots: the simple way

::: code-group

```ts [React Native]
const stop = callx.observe(snapshot => {
  render(snapshot.call); // null when there is no call
});
// later: stop();
```

```dart [Flutter]
final subscription = callx.snapshots.listen((snapshot) {
  render(snapshot.call);
});
// later: await subscription.cancel();
```

:::

The observer receives the current state immediately, then every change. A snapshot is complete:
render from it and you never need to merge events. Unsubscribing does not hang up.

`getSnapshot()` reads the current state once.

## Sessions: every event, with replay

The core keeps a durable journal of events. A session lets you resume from the last event you
processed, even after the app was killed.

```ts
// 1. Open, from your last processed sequence (or nothing on first run).
const session = await callx.openSession(lastSequence);

// 2. Adopt the snapshot; process replayed events for side effects only.
applySnapshot(session.snapshot);
for (const event of session.replay) await handle(event);

// 3. Listen for live events.
const stop = callx.observeEvents(session.sessionId, async event => {
  await handle(event);
  await callx.acknowledge(session.sessionId, event.sequence);
});

// 4. When done:
stop();
await callx.closeSession(session.sessionId);
```

| `session.status` | Meaning |
|---|---|
| `fresh` | No cursor given; no replay |
| `resumed` | `replay` holds the events after your cursor |
| `resynced` | Your cursor is older than the retained history. Replace local state with the snapshot; do not invent missing history |

### Events

| `kind` | Meaning |
|---|---|
| `callChanged` | The call changed; read it from the snapshot |
| `operationCompleted` | An operation reached its final result, even if the caller lost its promise |
| `resyncRequired` | The journal has a gap; adopt a fresh snapshot |

Each event carries `eventId`, `sequence`, `kind`, `source` (`local`, `platform`, `signaling`,
`media` or `recovery`), `observedAtMs` and, where relevant, `callId` and `operationId`.

### Rules for correct processing

- **Delivery is at least once.** Deduplicate by `eventId`.
- **Sequences are decimal strings.** Compare them as integers (`BigInt` in JavaScript), never as
  strings and never through `Number`.
- **Acknowledge only what you processed**, and persist your cursor with the account generation.
  Discard the cursor when the generation changes.
- **One session at a time.** Opening a new session makes the previous one stale. Own sessions in
  one place in your app and distribute state from there. The snapshot observer shares whichever
  session is open on the same `Callx` instance.

## Retention

| | Kept for |
|---|---|
| Journal | 24 hours, 2,048 events or 2 MiB, whichever comes first |
| Ended calls in snapshots | 5 minutes |
| Operation results | 24 hours or 10,000 operations |

All retention is per account generation.
