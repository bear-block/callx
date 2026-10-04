---
title: "Contract v0.3"
description: "The framework-neutral contract that the Swift, Kotlin, Dart and TypeScript layers implement, and its invariants."
---

# Contract v0.3

::: info Latest package release: 3.0.0
Audio routes, DTMF, caller name updates and system call requests are documented in
[phone features](/guide/phone-features). They use contract 0.3.0 and are published on npm and pub.dev.
:::

The contract defines the vocabulary every Callx layer speaks: states, commands, results, events
and limits. Swift, Kotlin, Dart and TypeScript implement it, and shared executable fixtures check
each of them. Contract version `0.3.0` is independent of package versions (packages are at
`3.0.0`). Each minor version only adds optional fields, commands and capabilities, so older
wrappers keep working: 0.2 added video ([ADR-0010](/project/decisions)) with two commands, and
0.3 adds audio routes, keypad tones and caller-name updates with three commands.

The machine-readable manifest and fixtures are in
[`contracts/v0`](https://github.com/bear-block/callx/tree/main/contracts/v0).

## Invariants

1. **One live call.** A `callId` is never reused; a ledger of ended calls (24 hours, 1,000 calls)
   stops reuse from ringing.
2. **Native owns state.** Dart and JavaScript never infer or commit call state.
3. **Answered is `connecting`.** `active` requires `mediaReady` and `mediaConnectedAtMs`.
4. **`ended` is terminal.** `endReason` is the domain reason.
5. **Operations exist before submission.** Same ID and arguments is the same operation; same ID
   with different arguments is `conflict`.
6. **Every known outcome is a result.** Validation errors may throw; rejection, timeout and
   unknown outcomes resolve with a status.
7. **Counters are decimal strings.** Sequences and revisions cross the bridge as unsigned decimal
   strings and are compared as integers.
8. **Timestamps are Unix milliseconds** within the JavaScript-safe integer range; unknown
   timestamps are absent, never `0`.
9. **Events are delivered at least once.** Consumers deduplicate by `eventId`.

## States

`incoming`, `outgoing`, `connecting`, `active`, `held`, `ended`. See
[call lifecycle](/concepts/call-lifecycle). `mediaInterrupted` is an optional flag, valid only
while `active` or `held` with `mediaReady`.

Video is not a state. A call may carry these optional fields, omitted at their defaults:

| Field | Values | Meaning |
|---|---|---|
| `video` | boolean | Offered or started as a video call |
| `localVideo` | `off`, `on`, `blocked` | The local camera; `blocked` means the OS took it |
| `cameraFacing` | `front`, `back` | Present exactly while `localVideo` is not `off` |
| `remoteVideo` | boolean | A remote video track can be rendered |

Audio routes (0.3) are observed from the OS and also omitted until it reports them:

| Field | Values | Meaning |
|---|---|---|
| `audioRoutes` | list of `{id, kind, name}` | Outputs the call can use now; cleared when the call ends |
| `audioRoute` | a route `id` | The output in use; always one of `audioRoutes`, absent when unknown |

`kind` is `earpiece`, `speaker`, `bluetooth`, `wired` or `other`. `id` is opaque and stable
while the device stays connected; `name` is the platform's label, such as a headset's name.

## Command envelope

```json
{
  "contractVersion": "0.3.0",
  "operationId": "op-answer-1",
  "type": "answer",
  "callId": "call-1",
  "deadlineAtMs": 1790000005000
}
```

| `type` | Extra fields |
|---|---|
| `startCall` | `input: {callId, displayName, handle, video?}` |
| `answer`, `end` | `callId` |
| `setMuted`, `setHeld`, `setCamera` | `callId`, `value: boolean` |
| `switchCamera` | `callId`, `value: "front" \| "back"` |
| `setAudioRoute` | `callId`, `value`: an `id` from the call's `audioRoutes` |
| `sendDtmf` | `callId`, `value`: 1–32 characters of `0-9`, `*`, `#` |
| `setDisplayName` | `callId`, `value`: the new display name |

`setAudioRoute` is valid while `outgoing`, `connecting`, `active` or `held`; an unlisted `id`
is `invalidArgument`. `sendDtmf` needs an `active` call and the `dtmf` capability, and leaves
the call unchanged. `setDisplayName` is valid in any live state.

## Snapshot

```json
{
  "contractVersion": "0.3.0",
  "watermark": "42",
  "calls": []
}
```

## Limits

| Item | Limit |
|---|---|
| IDs (`callId`, `operationId`, `eventId`) | 1–128 bytes, `^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$` |
| `displayName`, `handle` | 1–256 UTF-8 bytes |
| Audio route `id`, `name` | 1–128 UTF-8 bytes each |
| `sendDtmf` digits | 1–32 of `0-9`, `*`, `#` |
| Error message | 512 bytes |
| Platform `domain`, `code` | 128 bytes each |
| Deadline | At most 30 s ahead; default 10 s for `startCall`, 4 s otherwise |
| Operation results | 24 hours or 10,000 per account generation |
| Journal | 24 hours, 2,048 events or 2 MiB per account generation |
| Ended calls in snapshots | 5 minutes |

Limits count UTF-8 bytes, not UTF-16 code units.

## Compatibility

- `setup` returns `contractVersion`; the wrapper rejects an incompatible major version. Native
  accepts 0.1, 0.2 and 0.3 envelopes and answers with 0.3.
- `setup` also returns capabilities, including `video` when a video adapter is installed and
  `dtmf` when the media adapter sends keypad tones.
- New minor-version fields are optional. Command types are a closed set.
- Receivers keep unknown event and error values for logs, and resynchronize if they cannot
  interpret them safely.
