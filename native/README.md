# Canonical native cores

The Flutter and React Native packages share one Swift implementation on iOS and one
Kotlin implementation on Android. Read the [architecture](../docs/guides/architecture.md)
and [host integration guide](../docs/guides/native-integration.md).

## Current implementation

- `CallCoordinator`: two-phase commands, operation deduplication, terminal-state handling
  and call milestones. Preparation does not optimistically apply a command. A terminal
  ledger keeps ended call IDs (24 hours / 1,000 records) so they never ring again, and
  incoming calls end as `unanswered` at their ring deadline.
- `InvitationCodec` and `IncomingReportPolicy`: validate `call.invited` schema v1 and decide
  whether an invitation rings, using shared fixtures under `contracts/invitation-v1`.
- `CoordinatorFileStore`: versioned call, operation and journal checkpoints. Durable
  mutations restore the prior in-memory checkpoint when persistence fails.
- `CommandDispatcher`: executes prepared operations through `PlatformCommandExecutor`.
- `RecoveredOperationReconciler`: uses a host probe to resolve recovered pending work.
- `PlatformActionRegistry` and `RegistryBackedPlatformExecutor` (iOS): correlate CallKit
  completion, timeout and reset. Transaction submission is not action completion. Android
  needs neither: Core-Telecom returns the terminal result directly.
- `BridgeRuntime`: validates requests, exposes snapshots/sessions and receives host ingress.
- CallKit adapters and Android `telecom` module: connect platform actions to host behavior.
- `CallKitIngress` and `TelecomIngress`: the library-owned incoming path in BYO mode
  ([ADR-0007](../docs/adr/0007-library-owned-incoming-path.md)); `CallStylePresenter` is the
  default Android call notification.

Storage is optional in the coordinator constructor. Configure a file-backed store before
advertising durable replay. Atomic replacement and rollback tests do not prove every
process-kill or power-loss boundary.

Current retention limits: journal 24 hours / 2,048 events / 2 MiB; completed operations
24 hours / 10,000 entries. Ended calls leave public snapshots after five minutes; this
visibility rule is not a secure deletion policy.

## Check and distribute

From the repository root:

```sh
npm run native:ios:test
npm run native:android:test
packages/flutter/example/android/gradlew -p native/android :telecom:assembleDebug
./tool/check_native_sources.sh
```

The baseline uses Swift tools 6.0 and Kotlin/JVM 2.2.20 with JDK 17. Native tests consume
shared fixtures under `contracts/v0` through a test-only `ContractValidator`, which is not
shipped in the packages. Edit canonical sources here, then run
`./tool/sync_native_sources.sh`; do not edit vendored core copies independently.
Compile affected framework packages after synchronization. Device acceptance remains
separate from unit tests.
