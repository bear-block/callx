---
title: "Dart API"
description: "The complete Dart API of the callx and callx_livekit packages."
---

# Dart API

```dart
import 'package:callx/callx.dart';
```

The generated API documentation is on [pub.dev](https://pub.dev/documentation/callx/latest/).
This page summarizes it.

## `Callx`

```dart
final callx = Callx();
```

Create one instance for the app's lifetime. The constructor takes an optional `CallxBackend` for
tests; by default it uses the native plugin.

### Setup and state

| Member | Type | Description |
|---|---|---|
| `setup(CallxConfig config)` | `Future<CallxCapabilities>` | Validates `appName`, returns what the runtime supports |
| `getSnapshot()` | `Future<CallSnapshot>` | The current call, once |
| `snapshots` | `Stream<CallSnapshot>` | The current call now and on every change |
| `pushToken()` | `Future<PushToken?>` | `PushToken(type: 'voip' \| 'fcm', token: …)` |
| `dispose()` | `Future<void>` | Releases this instance. Does not hang up |

### Commands

Each takes an optional named `options: CommandOptions` and returns `Future<CommandResult>`.

| Method | Description |
|---|---|
| `startCall(CallInput input, {CommandOptions? options})` | Starts an outgoing call |
| `answer(String callId, {CommandOptions? options})` | Answers; the call becomes `connecting` |
| `end(String callId, {CommandOptions? options})` | Declines, cancels or hangs up |
| `setMuted(String callId, bool muted, {CommandOptions? options})` | Mutes or unmutes |
| `setHeld(String callId, bool held, {CommandOptions? options})` | Holds or resumes |
| `queryOperation(String operationId, String accountGeneration)` | `Future<OperationLookup>` |

### Observation sessions

| Method | Type |
|---|---|
| `openSession([String? afterSequence])` | `Future<ObservationSession>` |
| `eventsFor(String sessionId)` | `Stream<CallEvent>` |
| `acknowledge(String sessionId, String throughSequence)` | `Future<void>` |
| `closeSession(String sessionId)` | `Future<void>` |

## Types

| Type | Fields |
|---|---|
| `CallxConfig` | `appName` |
| `CallInput` | `callId`, `displayName`, `handle` |
| `CommandOptions` | `operationId?`, `deadlineAtMs?` |
| `CallxCapabilities` | `coreVersion`, `execution`, `accountGeneration`, `nativeCalling`, `durableReplay`, `providerManagedSignaling`, `hold`, `mute` |
| `CallSnapshot` | `sequence`, `call?` |
| `Call` | `callId`, `displayName`, `direction`, `state`, `muted`, `mediaReady`, `mediaInterrupted`, `endReason?`, `createdAtMs?`, `acceptedAtMs?`, `mediaConnectedAtMs?`, `endedAtMs?` |
| `CommandResult` | `operationId`, `status`, `execution`, `completedAtMs`, `error?` |
| `OperationError` | `code`, `message`, `retryable`, `platform?` |
| `PlatformError` | `domain`, `code` |
| `OperationLookup` | `operationId`, `accountGeneration`, `status`, `result?` |
| `ObservationSession` | `sessionId`, `accountGeneration`, `status`, `snapshot`, `replay` |
| `ObservationSnapshot` | `watermark`, `calls` |
| `CallEvent` | `eventId`, `sequence`, `kind`, `source`, `observedAtMs`, `callId?`, `operationId?` |
| `PushToken` | `type`, `token` |

## Enums

| Enum | Values |
|---|---|
| `CallState` | `incoming`, `outgoing`, `connecting`, `active`, `held`, `ended` |
| `CallDirection` | `incoming`, `outgoing` |
| `EndReason` | `localHangup`, `declined`, `remoteEnded`, `callerCancelled`, `unanswered`, `busy`, `failed`, `answeredElsewhere`, `declinedElsewhere` |
| `CommandStatus` | `applied`, `rejected`, `timedOut`, `unknown` |
| `OperationLookupStatus` | `available`, `unavailable`, `generationMismatch` |
| `SessionOpenStatus` | `fresh`, `resumed`, `resynced` |
| `CallEventKind` | `callChanged`, `operationCompleted`, `resyncRequired` |
| `CallEventSource` | `local`, `platform`, `signaling`, `media`, `recovery` |
| `CallxErrorCode` | See [errors](/reference/errors) |
| `ExecutionMode` | `native`, `preview` |

## `CallxException`

```dart
class CallxException implements Exception { final String code; final String message; }
```

Thrown for validation and transport errors. Results with `rejected`, `timedOut` or `unknown`
status are returned, not thrown.

## Simulator

```dart
import 'package:callx/callx_preview.dart';
final preview = CallxPreview();
// preview.callx, preview.simulator
```

`simulator` offers `incoming(CallInput)`, `remoteAnswered()`, `mediaConnected()`,
`remoteEnded()` and `reset()`.

## `callx_livekit`

```dart
import 'package:callx_livekit/callx_livekit.dart';

await CallxLiveKit.configure(LiveKitConfig(tokenUrl: url, headers: {...}));
await CallxLiveKit.reset();
```
