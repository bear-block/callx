---
title: "Errors"
description: "Every Callx error code, when it occurs, whether it is retryable, and how to handle it."
---

# Errors

Callx reports problems in two ways:

- **Results.** Known outcomes of a command (rejected, timed out, unknown) resolve normally with a
  `CommandResult` whose `error` explains it.
- **Exceptions.** Validation and transport problems throw: `CallxError` in TypeScript,
  `CallxException` in Dart. Native rejections can also surface as the framework's own error
  types; read the `code` when present.

```ts
try {
  const result = await callx.answer(callId);
  if (result.status !== 'applied') handle(result.error);
} catch (error) {
  handleThrown((error as {code?: string}).code);
}
```

## Error codes

| Code | When | Retryable |
|---|---|---|
| `invalidArgument` | Malformed input, a limit exceeded, a deadline more than 30 s away, or a contract version mismatch between native and framework code | No |
| `notConfigured` | No native runtime is installed: the bootstrap did not run or failed | No |
| `nativeUnavailable` | The native module is missing (not rebuilt, web, Expo Go), or the platform reset before completing | Yes |
| `callNotFound` | No live call has this `callId` | No |
| `busy` | `startCall` while another call is live | No |
| `invalidState` | The call's state does not allow the command: answering a call that is not `incoming`, holding a call that is not `active`, starting a call with an ID that already ended | No |
| `unsupported` | The runtime lacks the capability, for example no outgoing-call starter on Android | No |
| `platformRejected` | CallKit or Core-Telecom refused the action. `error.platform` has the diagnostic `{domain, code}` | Depends |
| `mediaNotReady` | The media engine could not apply mute | Yes |
| `deadlineExceeded` | Paired with status `timedOut` | Reconcile first |
| `conflict` | The `operationId` was already used with different arguments | No |
| `internal` | An unexpected native failure | Report it |
| `permissionDenied` | Reserved; not emitted in this version | |
| `journalGap` | Reserved; not emitted in this version | |

`retryable` on the error is authoritative. Retry with the **same** `operationId`.

## Platform details

`error.platform` is for logs and diagnostics, not control flow. Domains include CallKit's
`CXErrorCodeRequestTransactionError` and `CXErrorCodeIncomingCallError` codes on iOS and
Core-Telecom's `CallException` codes on Android. They can change between OS versions.

## Messages

`error.message` is English, for developers, and never contains personal data such as names,
handles or tokens. Show your own text to users.
