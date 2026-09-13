# Canonical native cores

These two modules are the contract/coordinator seam shared per OS by Flutter and React Native.
They do not contain CallKit, Telecom, push or media adapters yet.

- `ios`: Swift Package, baseline Swift tools 6.0; run `swift test` in `native/ios`.
- `android`: Kotlin/JVM 2.2.20, JDK 17; from the root run
  `packages/flutter/example/android/gradlew -p native/android test`.

Both test suites read the manifest and fixtures in `contracts/v0` directly; there is no native copy that
can drift from the schema. Host tests prove decode/validation parity, not the bridge
round trip, persistence across process death or OS behaviour.