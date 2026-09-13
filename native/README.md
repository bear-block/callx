# Canonical native cores

These two modules are the contract/coordinator seam shared per OS by Flutter and React Native.
They do not contain CallKit, Telecom, push or media adapters yet.

- `ios`: Swift Package, baseline Swift tools 6.0; run `swift test` in `native/ios`.
- `android`: Kotlin/JVM 2.2.20, JDK 17; from the root run
  `packages/flutter/example/android/gradlew -p native/android test`.

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