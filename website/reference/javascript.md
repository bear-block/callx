---
title: "JavaScript API"
description: "The complete TypeScript API of @bear-block/callx and @bear-block/callx-livekit."
---

# JavaScript API

```ts
import {Callx} from '@bear-block/callx';
```

The package ships TypeScript types. Every value below is exported from `@bear-block/callx`; the
simulator is in `@bear-block/callx/preview`.

## `Callx`

```ts
const callx = new Callx();
```

Create one instance for the app's lifetime. The constructor takes an optional backend for tests;
by default it uses the native module.

### Setup and state

| Method | Returns | Description |
|---|---|---|
| `setup(config?: CallxConfig)` | `Promise<Capabilities>` | Connects to the native core and returns what the runtime supports; takes no required arguments |
| `getSnapshot()` | `Promise<Snapshot>` | The current call, once |
| `observe(listener)` | `() => void` | Calls `listener(snapshot)` now and on every change; returns an unsubscribe function |
| `getPushToken()` | `Promise<PushToken \| null>` | The device's call push token: `{type: 'voip', token}` on iOS, `{type: 'fcm', token}` on Android |
| `dispose()` | `void` | Releases this instance. Does not hang up |

`setup()` takes no arguments. The incoming and ongoing call screens show your app's display name: `CFBundleDisplayName` on iOS (change the CallKit icon and ringtone through `providerConfiguration`, see [iOS](/platforms/ios#provider-configuration)) and `android:label` on Android. `CallxConfig.appName` is deprecated and ignored; passing it still compiles.

### Commands

All commands accept an optional last argument `options: CommandOptions` and resolve with a
`CommandResult`. See [commands and results](/concepts/commands).

| Method | Description |
|---|---|
| `startCall(input: CallInput, options?)` | Starts an outgoing call |
| `answer(callId, options?)` | Answers the incoming call; the call becomes `connecting` |
| `end(callId, options?)` | Declines, cancels or hangs up |
| `setMuted(callId, muted: boolean, options?)` | Mutes or unmutes the microphone |
| `setHeld(callId, held: boolean, options?)` | Holds or resumes the call |
| `queryOperation(operationId, accountGeneration)` | Looks up a stored result: `Promise<OperationLookup>` |

### Observation sessions

| Method | Returns | Description |
|---|---|---|
| `openSession(afterSequence?: string)` | `Promise<ObservationSession>` | Opens the session with a snapshot and replay after the cursor |
| `observeEvents(sessionId, listener)` | `() => void` | Live events for the session |
| `acknowledge(sessionId, throughSequence)` | `Promise<void>` | Marks events as processed |
| `closeSession(sessionId)` | `Promise<void>` | Closes the session (not the call) |

See [observation and replay](/concepts/observation).

## Types

```ts
interface CallxConfig { /** @deprecated Ignored. */ appName?: string }

interface CallInput { callId: string; displayName: string; handle: string }

interface CommandOptions { operationId?: string; deadlineAtMs?: number }

interface Capabilities {
  contractVersion: '0.1.0';
  coreVersion: string;
  execution: 'native' | 'preview';
  accountGeneration: string;
  nativeCalling: boolean;
  durableReplay: boolean;
  providerManagedSignaling: boolean;
  hold: boolean;
  mute: boolean;
}

interface Snapshot { sequence: string; call: Call | null }

interface Call {
  callId: string;
  displayName: string;
  direction: 'incoming' | 'outgoing';
  state: CallState;
  muted: boolean;
  mediaReady: boolean;
  mediaInterrupted?: boolean;
  endReason?: EndReason;
  createdAtMs?: number;
  acceptedAtMs?: number;
  mediaConnectedAtMs?: number;
  endedAtMs?: number;
}

type CallState = 'incoming' | 'outgoing' | 'connecting' | 'active' | 'held' | 'ended';

type EndReason = 'localHangup' | 'declined' | 'remoteEnded' | 'callerCancelled' | 'unanswered'
  | 'busy' | 'failed' | 'answeredElsewhere' | 'declinedElsewhere';

interface CommandResult {
  contractVersion: '0.1.0';
  operationId: string;
  status: 'applied' | 'rejected' | 'timedOut' | 'unknown';
  execution: 'native' | 'preview';
  completedAtMs: number;
  error?: OperationError;
}

interface OperationError {
  code: ErrorCode;
  message: string;
  retryable: boolean;
  platform?: {domain: string; code: string};
}

interface OperationLookup {
  contractVersion: '0.1.0';
  operationId: string;
  accountGeneration: string;
  status: 'available' | 'unavailable' | 'generationMismatch';
  result?: CommandResult;
}

interface ObservationSession {
  contractVersion: '0.1.0';
  sessionId: string;
  accountGeneration: string;
  status: 'fresh' | 'resumed' | 'resynced';
  snapshot: {contractVersion: '0.1.0'; watermark: string; calls: Call[]};
  replay: CallEvent[];
}

interface CallEvent {
  contractVersion: '0.1.0';
  eventId: string;
  sequence: string;
  kind: 'callChanged' | 'operationCompleted' | 'resyncRequired';
  source: 'local' | 'platform' | 'signaling' | 'media' | 'recovery';
  observedAtMs: number;
  callId?: string;
  operationId?: string;
}

interface PushToken { type: 'voip' | 'fcm'; token: string }
```

## Constants

| Export | Value |
|---|---|
| `CONTRACT_VERSION` | `'0.1.0'` |
| `CALL_STATES` | All `CallState` values |
| `END_REASONS` | All `EndReason` values |
| `COMMAND_STATUSES` | All command statuses |
| `ERROR_CODES` | All [error codes](/reference/errors) |

## `CallxError`

```ts
class CallxError extends Error { readonly code: string }
```

Thrown for validation errors before the native call. Native rejections may also surface as the
framework's own errors; read `error.code` when present. See [errors](/reference/errors).

## Simulator

```ts
import {createCallxPreview} from '@bear-block/callx/preview';
const {callx, simulator} = createCallxPreview();
```

| `simulator` method | Simulates |
|---|---|
| `incoming(input: CallInput)` | An invitation that rings |
| `remoteAnswered()` | The other side answered your outgoing call |
| `mediaConnected()` | Media starts flowing |
| `remoteEnded()` | The other side hung up |
| `reset()` | Clears all state |

## `@bear-block/callx-livekit`

```ts
import {configureLiveKit, resetLiveKit} from '@bear-block/callx-livekit';
```

| Export | Description |
|---|---|
| `configureLiveKit(config: LiveKitConfig): Promise<void>` | Persists where room credentials come from |
| `resetLiveKit(): Promise<void>` | Forgets it, for example on sign-out |
| `validateConfig(config): void` | Throws `CallxLiveKitError` for an invalid configuration |
| `CallxLiveKitError` | Error class |

```ts
interface LiveKitConfig {
  tokenUrl: string;                          // http(s) URL
  headers?: Record<string, string>;          // stored encrypted
}
```
