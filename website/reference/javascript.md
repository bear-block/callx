---
title: "JavaScript API"
description: "The complete TypeScript API of @bear-block/callx and @bear-block/callx-livekit."
---

# JavaScript API

::: info Development reference
This page describes version 0.2.2 with contract 0.2.0, native video and Android PiP.
See [status](/project/status) for verification limits and [changelog](/project/changelog).
:::


```ts
import {Callx} from '@bear-block/callx';
```

The package ships TypeScript types. Core values are exported from `@bear-block/callx`; the simulator is in
`@bear-block/callx/preview`, and video/PiP exports are in `@bear-block/callx/video`.

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
| `setCamera(callId, on: boolean, options?)` | Turns the local camera on or off; needs a video adapter and the app in front. See [video calls](/guide/video) |
| `switchCamera(callId, facing: CameraFacing, options?)` | Chooses the front or back camera; remembered while the camera is off |
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

interface CallInput { callId: string; displayName: string; handle: string; video?: boolean }

interface CommandOptions { operationId?: string; deadlineAtMs?: number }

interface Capabilities {
  contractVersion: '0.2.0';
  coreVersion: string;
  execution: 'native' | 'preview';
  accountGeneration: string;
  nativeCalling: boolean;
  durableReplay: boolean;
  providerManagedSignaling: boolean;
  hold: boolean;
  mute: boolean;
  video: boolean;          // a video media adapter is installed
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
  video?: boolean;              // offered or started as a video call
  localVideo?: LocalVideo;      // absent means 'off'
  cameraFacing?: CameraFacing;  // present while localVideo is not 'off'
  remoteVideo?: boolean;        // a remote video track can be rendered
  endReason?: EndReason;
  createdAtMs?: number;
  acceptedAtMs?: number;
  mediaConnectedAtMs?: number;
  endedAtMs?: number;
}

type CallState = 'incoming' | 'outgoing' | 'connecting' | 'active' | 'held' | 'ended';

type LocalVideo = 'off' | 'on' | 'blocked';   // blocked: the OS took the camera, e.g. in the background
type CameraFacing = 'front' | 'back';

type EndReason = 'localHangup' | 'declined' | 'remoteEnded' | 'callerCancelled' | 'unanswered'
  | 'busy' | 'failed' | 'answeredElsewhere' | 'declinedElsewhere';

interface CommandResult {
  contractVersion: '0.2.0';
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
  contractVersion: '0.2.0';
  operationId: string;
  accountGeneration: string;
  status: 'available' | 'unavailable' | 'generationMismatch';
  result?: CommandResult;
}

interface ObservationSession {
  contractVersion: '0.2.0';
  sessionId: string;
  accountGeneration: string;
  status: 'fresh' | 'resumed' | 'resynced';
  snapshot: {contractVersion: '0.2.0'; watermark: string; calls: Call[]};
  replay: CallEvent[];
}

interface CallEvent {
  contractVersion: '0.2.0';
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
| `CONTRACT_VERSION` | `'0.2.0'` |
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
| `remoteVideo(available: boolean)` | The other side starts or stops sending video |
| `cameraBlocked(blocked: boolean)` | The OS takes the camera, or gives it back |
| `reset()` | Clears all state |

## `CallxVideoView`

```tsx
import {CallxVideoView} from '@bear-block/callx/video';

<CallxVideoView callId={call.callId} source="remote" fit="cover" style={{flex: 1}} />
```

| Prop | Type | Default | Description |
|---|---|---|---|
| `callId` | `string` | required | The call whose video to show |
| `source` | `'local' \| 'remote'` | `'remote'` | The camera of this device, or the other side's video |
| `fit` | `'cover' \| 'contain'` | `'cover'` | Crop to fill the view, or letterbox inside it |
| `mirror` | `boolean` | `false` | Flip horizontally, usually for the front camera preview |

Plus the usual `ViewProps` such as `style`. A Fabric component, with a legacy view manager for
the old architecture on iOS. The view stays empty until the source exists. See
[video calls](/guide/video).

## Android picture in picture

Import these functions from `@bear-block/callx/video`:

| Export | Behaviour |
|---|---|
| `configurePictureInPicture({automatic: boolean}): void` | Enables auto-entry on Android 12+ while an answered video call is live |
| `enterPictureInPicture(): Promise<boolean>` | Requests entry; false when the activity or device cannot enter PiP |
| `addPictureInPictureListener(listener: (inPiP: boolean) => void): () => void` | Reports mode changes; returns an unsubscribe function |

iOS configuration has no effect and entry returns false. PiP uses the entire Android activity;
your app renders the video or its own branded fallback. See [PiP layout](/guide/video#picture-in-picture-on-android).

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
