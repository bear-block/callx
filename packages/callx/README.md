# callx

Native call coordination for Flutter using iOS CallKit and Android Core-Telecom.
Includes typed commands, call snapshots, operation lookup and observation sessions.

## Start here: choose simulation or a real integration

For a UI-only demonstration, follow **Run the customized example** below. For real
calls, complete these steps in order:

1. Install this package into a Flutter iOS/Android app.
2. Configure native permissions, platform reporting and an application-scoped runtime.
3. Implement native signaling/media and forward FCM messages to Callx; Callx receives
   VoIP pushes, rings the call and shows the Android call notification.
4. Register device tokens with your backend and send a real call invitation.
5. Use `Callx()`, check capabilities, and verify incoming → answer → audio → end.

This package provides coordination, the native incoming-call path and adapter seams,
not a signaling server, push sender or media engine. Neither `flutter pub get` nor
Dart `setup` creates those integrations. Timing-critical incoming handling must work before the
Dart engine attaches.

| Integration question | Detailed guide |
|---|---|
| What push do I send? How should signaling work? | [Backend endpoints and APNs/FCM payloads](https://callx.pages.dev/guides/backend) |
| What Swift/Kotlin host code is required? | [Native bootstrap](https://callx.pages.dev/guides/native-host) |
| What owns call state and audio? | [Architecture](https://callx.pages.dev/concepts/architecture) |
| How do retries and event recovery work? | [API and recovery](https://callx.pages.dev/concepts/commands) |

Flutter does not use
the Expo plugin: configure its generated native host directly. Set an iOS microphone
description, appropriate audio/VoIP background capabilities and signing; declare
Android `INTERNET`, `RECORD_AUDIO`, `MANAGE_OWN_CALLS` and any additional permissions
required by your notification/media integration. Request runtime permissions where
applicable; a manifest declaration is not a grant.
Set `minSdk = 29` in `android/app/build.gradle(.kts)`; the Flutter template default
is lower and the Android build fails below the plugin's floor.

## Status and requirements

Native integration preview; not yet published or production-validated. Supports one
live call. Native calling targets iOS/Android; web is simulator-only. Requires Dart
`^3.11.4`, Flutter `>=3.41.0`, iOS 15+ / Swift 6, and Android API 29+ with a compatible
Android build toolchain. The recorded development baseline is Flutter 3.47.5.
Bring your own native signaling/media integration, push setup and app permissions.

Version `0.0.0-preview.1`. The package contains a typed MethodChannel/EventChannel backend,
Android/iOS entry points and the canonical Kotlin/Swift coordinator. It never falls back
silently to the simulator.

Read the [English integration and API guides](https://callx.pages.dev/)
for architecture, native bootstrap, recovery and device acceptance.

## Run the customized example now

From this package directory:

```sh
flutter pub get
cd example
flutter run -d chrome
```

The example also has generated iOS/Android host projects. Use `flutter run -d <device-id>`
to run the same simulated UI there. Real calls require host runtime and provider wiring.
Web support is for this preview only, not a production calling support promise.

## Try it in your own app before release

The package is not on pub.dev yet, so point your app's `pubspec.yaml` at this checkout:

```yaml
dependencies:
  callx:
    path: /absolute/path/to/callx/packages/callx
```

Run `flutter pub get`, set Android `minSdk = 29` as described above, then build and run the
app. Flutter installs the iOS side itself through Swift Package Manager or CocoaPods. Dart
changes in the package apply on hot restart, but Swift/Kotlin changes need a full rebuild:
stop the app and run `flutter run` again.

## Try the API

```dart
import 'package:callx/callx.dart';
import 'package:callx/callx_preview.dart';

Future<void> demo() async {
  final preview = CallxPreview(); // Explicit opt-in; never an automatic fallback.
  final callx = preview.callx;
  final subscription = callx.snapshots.listen((snapshot) {
    print('${snapshot.sequence}: ${snapshot.call?.state.name}');
  });

  await callx.setup(const CallxConfig(appName: 'Acme Support'));

  // Test harness only — production invitation arrives through native ingress.
  await preview.simulator.incoming(
    const CallInput(callId: 'demo-1', displayName: 'hao.dev7', handle: 'sip:hao.dev7@example.invalid'),
  );
  final result = await callx.answer('demo-1');
  print(result.execution.name); // preview
  // State is connecting, not active/audio-ready.
  await preview.simulator.mediaConnected(); // No microphone or audio is started.
  await callx.setMuted('demo-1', true);
  await callx.setHeld('demo-1', true);
  await callx.setHeld('demo-1', false);
  await callx.end('demo-1');

  await subscription.cancel(); // Detach observer, not a hangup operation.
  await callx.dispose(); // Release the preview instance when its owner is done.
}
```

## Installation after publication

```sh
flutter pub add callx
```

The intended construction is `final callx = Callx();`, followed by `setup`. A missing plugin
throws `nativeUnavailable`; an attached but unwired host returns `nativeCalling: false` and
commands throw `CallxException` with code `notConfigured`.

Native app bootstrap, PushKit/APNs, FCM/Telecom presentation, permissions and a native
provider/media adapter are still required. A package install or Dart setup call alone
cannot establish those capabilities.

## Native host wiring

Create one durable `CallCoordinator`, a platform executor backed by CallKit/Core-Telecom plus
your native media/signaling implementation, and a stable login-generation ID. Install it before
the first Dart `setup` call. The [native bootstrap guide](https://callx.pages.dev/guides/native-host) shows how
`telecomExecutor` and `callKitExecutor` are assembled from the packaged adapters and how to
reconcile work left pending by a previous process. In BYO signaling mode also create
`CallKitIngress` / `TelecomIngress`, which receive pushes and ring the call. In Swift, `import callx`.

```kotlin
val runtime = BridgeRuntime(coordinator, telecomExecutor,
  BridgeCapabilities(accountGeneration, true, false, hold = true, mute = true))
CallxPlugin.configure(runtime)
```

```swift
let runtime = BridgeRuntime(coordinator: coordinator, executor: callKitExecutor,
  capabilities: .init(accountGeneration: accountGeneration, durableReplay: true,
    providerManagedSignaling: false, hold: true, mute: true),
  nowMs: { Int64(Date().timeIntervalSince1970 * 1000) })
CallxPlugin.configure(runtime)
```

Push/signaling code calls `runtime.reportIncoming(...)`, `remoteAnswered(...)` and
`remoteEnded(...)`; the media engine calls `mediaConnected(...)`. Do not call
`mediaConnected` merely because answer succeeded. On iOS, only fulfill a CallKit action after
the native performer has completed its signaling/media work.

## Preview contract and limits

- One live call. States: incoming, outgoing, connecting, active, held, ended.
- answer is separate from mediaConnected. All effects are in memory.
- Commands return operationId/status/execution; invalid operations throw CallxException.
- Save `capabilities.accountGeneration`, then use
  `queryOperation(operationId, accountGeneration)` after an ambiguous timeout. The lookup is
  `available`, `unavailable`, or `generationMismatch`; `unavailable` is not proof that the
  command never ran.
- Durable-observation shape is available through `openSession([afterSequence])`,
  `eventsFor(sessionId)`, `acknowledge(...)`, and `closeSession(...)`. Preview replay is
  memory-only and deliberately reports `durableReplay: false`.
- Snapshots are immutable, include a decimal-string sequence and current call.
- Each stream subscriber receives current snapshot plus changes. No durable replay/ack.
- No OS UI, background execution, delivery guarantees, timeout simulation, real media or network.
- Reset clears the simulator; it is not a production SDK command.
- SDK/toolchain baseline here: Flutter 3.47.5 / Dart 3.13.4. Production baseline is not frozen.
- The native core is connected behind `CallxBackend`; the simulator remains explicit.

## Check

```sh
flutter test
dart analyze
cd example
flutter test
flutter build web
```

Package tests use shared preview fixtures in the development monorepo. Those fixtures are not
a runtime dependency. Preview API remains subject to change; do not ship it as a calling SDK.

## Build and release

Run package checks above and `flutter pub publish --dry-run` from this directory.
A plugin ships source; build the example on both native platforms to validate its
integration. Before upload, follow the full
[build-to-pub.dev runbook](https://callx.pages.dev/project/contributing),
including clean consumers, version/changelog updates and device evidence.

## Troubleshooting and support

`nativeUnavailable` means the native plugin is unavailable in the current host;
`notConfigured` means host runtime setup is missing. An applied answer does not
prove media readiness. See the
[troubleshooting guide](https://callx.pages.dev/guides/testing).
When reporting an issue, include package/framework/OS versions and a minimal
reproduction with sanitized logs. Do not include credentials or push tokens.

## License

MIT. See [LICENSE](LICENSE). Third-party platform/provider dependencies retain their
own licenses and configuration requirements.
