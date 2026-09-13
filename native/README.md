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

The Swift core has a versioned `CoordinatorCheckpoint` and atomic file replacement with iOS data
protection, tested to restore live state together with pending/completed operations. The coordinator does not yet
transaction-wrap every mutation with the store; the Kotlin store and the crash-boundary transaction are the next
step, so this is not yet called a complete durable journal.