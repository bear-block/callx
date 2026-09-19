# Canonical native cores

These two modules are the contract/coordinator seam shared per OS by Flutter and React Native,
with compiled CallKit and Core-Telecom adapters. Push, notification presentation and a concrete
media backend still belong to the next integration slices.

- `ios`: Swift Package, baseline Swift tools 6.0; run `swift test` in `native/ios`.
- `android`: Kotlin/JVM 2.2.20, JDK 17; from the root run
  `packages/flutter/example/android/gradlew -p native/android test :telecom:assembleDebug`.

Both test suites read the manifest and fixtures in `contracts/v0` directly; there is no native copy that
can drift from the schema. Host tests prove decode/validation parity, not the bridge
round trip, persistence across process death or OS behaviour.

`CallCoordinator` in both cores now proves two-phase command semantics: prepare does not
optimistically mutate state; only an applied callback commits; duplicate operations are deduped; argument
conflicts are rejected; a deadline/remote terminal beats a late callback. Storage is still memory-only.

The Swift and Kotlin cores have a versioned `CoordinatorCheckpoint` with atomic file replacement,
tested to restore live state and pending/completed operations. Swift applies iOS data protection;
the Android adapter must later put the file in app-private credential-protected storage.
The coordinator does not yet transaction-wrap every mutation with the store; the Kotlin checkpoint has no event
journal yet, so this is not yet called a complete durable journal.

The Swift and Kotlin checkpoints now contain an event journal with sequence, acknowledgement,
replay-gap detection and pruning at 24 hours/2,048 events/2 MiB. The crash-boundary transaction is still
not complete, so Gate B3 remains unmet.

Both cores have durable mutation entry points using snapshot-before-mutation: success is returned only after
the store commits; a write failure restores the old memory checkpoint and rethrows. Platform adapters must
call the `durable*` group, never the memory-only mutations. Fault-store tests prove a pending
operation does not leak into memory or disk when persisting prepare fails. A real process kill between
filesystem syscalls cannot be fault-injected yet, so Gate B3 still has not passed.

`CommandDispatcher` in both cores connects the two-phase coordinator to `PlatformCommandExecutor` and is
tested for applied/rejected/deadline and duplicates before/after completion. Callers of the same operation
share one Swift `Task` or Kotlin `CompletionStage`; the executor runs only once. Pending operations
restored after a process restart deliberately require platform reconciliation instead of waiting for a callback that
was lost. The executor is still a simulated seam, not evidence of CallKit/Telecom.

`RecoveredOperationReconciler` handles pending checkpoints before the bridge attaches: an expired deadline
beats every probe; platform-confirmed applied/rejected are durably finalised; unavailable becomes
`unknown/nativeUnavailable` without mutating the call or retrying blindly. The probe is currently an abstraction;
real adapters must query/reconcile CallKit/Telecom and the signaling backend per capability.

`PlatformActionRegistry` in both cores buffers callbacks that arrive before the waiter, applies first-terminal-wins,
fans out timeouts/provider resets and drops late duplicates. The registry does not treat transaction
submission as applied; the executor must submit the transaction and then wait for the registry outcome.

`RegistryBackedPlatformExecutor` now implements that pipeline: a submission rejection ends immediately;
a submission acceptance only moves on to waiting for the action registry. An action timeout produces `timedOut`, while
a provider reset produces `unknown/nativeUnavailable`; neither case is forced into rejected.

iOS has `CallKitTransactionSubmitter` and `CallKitProviderDelegateAdapter`, which compile for the generic
iOS 15 device target. Correlation uses the unique `CXAction.uuid`; an action is fulfilled only after the host's
media/signaling performer succeeds. `startCall` currently returns unsupported because the native command has no
validated handle yet; callId is never used as an implicit handle.

Android has a `:telecom` module with compileSdk 36/minSdk 29 using Core-Telecom 1.0.1. The adapter keeps the
`CallControlScope` after `CallsManager.addCall` through `TelecomCallResolver`, calls the right suspend APIs
`answer`/`disconnect`/`setActive`/`setInactive`, respects deadlines and normalises native errors into
contract errors. Stable Core-Telecom has no mute setter: `MediaMuteController` owns mute,
without faking a symmetric Telecom API. The host must own the application coroutine/session lifetime;
an Activity or the Flutter/RN engine must not own this scope.