---
title: "Commands and results"
description: "Idempotent commands with explicit results, deadlines, operation IDs and lookup after a crash."
---

# Commands and results

Every action your app takes on a call is a command: `startCall`, `answer`, `end`, `setMuted`
and `setHeld`. Each one returns a result that says what actually happened. A command never
fails silently and never reports success because a request was merely sent.

## Results

```ts
const result = await callx.answer(callId);
// {operationId, status, execution, completedAtMs, error?}
```

| `status` | Meaning | What to do |
|---|---|---|
| `applied` | The action completed on the platform | Follow the observed state |
| `rejected` | The action did not happen; `error` says why | Show the error or recover |
| `timedOut` | The deadline passed before a final outcome | Reconcile before trying again |
| `unknown` | The result was lost (for example the bridge reset) | Look it up; do not assume it did not run |

`applied` means the platform action finished, not that audio flows. Answer is applied when
CallKit or Telecom confirms the answer; the call is then `connecting`.

Validation and programming errors (a malformed call ID, a missing native module) throw instead
of resolving. Catch both: see [errors](/reference/errors).

## Operation IDs make retries safe

Each command has an `operationId`. Callx generates one if you do not pass it, but for anything
you might retry, pass your own and store it first:

```ts
const operationId = `answer-${callId}`;
await storage.save('pendingAnswer', {operationId, generation});
const result = await callx.answer(callId, {operationId});
```

- Retrying with the same ID and the same arguments is the same operation: it runs once, and
  the retry returns the stored result.
- Reusing an ID with different arguments returns `conflict`.
- Never retry a side-effecting command with a new ID after an ambiguous result; look it up
  first.

## Looking up an operation

After a crash, a reload or an `unknown` result, ask the core what happened:

```ts
const lookup = await callx.queryOperation(operationId, accountGeneration);
```

| `lookup.status` | Meaning |
|---|---|
| `available` | `lookup.result` is the stored final result |
| `unavailable` | Pending, never received, or pruned. Not proof that it did not run: reconcile with your backend |
| `generationMismatch` | The operation belongs to a different login; do not replay it |

Results are kept for 24 hours or 10,000 operations per account generation, whichever comes
first. This is a recovery aid, not an audit log.

## Deadlines

Pass `deadlineAtMs` (absolute Unix milliseconds) to bound a command. Without it, Callx allows 10
seconds for `startCall` and 4 seconds for the others.

- A deadline more than 30 seconds away is rejected with `invalidArgument`.
- An already-expired deadline completes as `timedOut` without side effects. A retry of a
  finished operation still returns its stored result, even after its deadline.

## Limits

| Input | Limit |
|---|---|
| `operationId`, `callId` | `^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$`, at most 128 bytes |
| `displayName`, `handle` | Non-empty, at most 256 UTF-8 bytes |
| `appName` | Non-empty, at most 128 UTF-8 bytes |

Use a UUID for `callId`. It also maps cleanly to CallKit's UUIDs.

## Capabilities

`setup()` returns what the installed runtime supports:

```ts
const caps = await callx.setup({appName: 'Acme'});
// {contractVersion, coreVersion, execution, accountGeneration, nativeCalling,
//  durableReplay, providerManagedSignaling, hold, mute}
```

Disable controls the runtime does not support. `nativeCalling: false` means the bootstrap did
not run or failed, for example on a device without Telecom. Capabilities describe the
configuration; they do not prove that pushes or audio work on this device.

## Disposal is not hang-up

`dispose()` releases the SDK instance's resources and observers. It does not end the call. Use
`end(callId)` to hang up. Keep one `Callx` instance alive for the app's lifetime.
