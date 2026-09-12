# callx — Flutter SDK experience preview

Version `0.0.0-preview.1`. **Local preview, not published. No native calling yet.**
This is currently a Dart API package, not a completed native Flutter plugin.
Publishing is disabled with `publish_to: none`.

## Run the customized example now

From this package directory:

```sh
flutter pub get
cd example
flutter run -d chrome
```

The example also has generated iOS/Android host projects. Use `flutter run -d <device-id>`
to run the same **simulated** UI there. These hosts do not contain CallKit/Telecom integration.
Web support is for this preview only, not a production calling support promise.

## Add to another local Flutter app

Use the actual path to this package in the consumer's pubspec.yaml:

```yaml
dependencies:
  callx:
    path: /absolute/path/to/callx/packages/flutter
```

Then run `flutter pub get`. The package's runtime sources do not reference the monorepo.

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
    const CallInput(callId: 'demo-1', displayName: 'hao.dev7'),
  );
  final result = await callx.answer('demo-1');
  print(result.execution); // preview
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

## Installation after a future release — hypothetical

Once the real plugin is published under an available/owned name:

```sh
flutter pub add callx
```

Then the intended construction is `final callx = Callx();`, followed by native integration
and `setup`. **Today, `Callx().setup(...)` throws `nativeNotImplemented`.**
The command above is not a way to install this unpublished preview.

Native app bootstrap, PushKit/APNs, FCM/Telecom presentation, permissions and a native
provider/media adapter will still be required. A package install or Dart setup call alone
cannot establish those capabilities.

## Preview contract and limits

- One live call. States: incoming, outgoing, connecting, active, held, ended.
- answer is separate from mediaConnected. All effects are in memory.
- Commands return operationId/status/execution; invalid operations throw CallxException.
- Snapshots are immutable, include a decimal-string sequence and current call.
- Each stream subscriber receives current snapshot plus changes. No durable replay/ack.
- No OS UI, background execution, delivery guarantees, timeout simulation, real media or network.
- Reset clears the simulator; it is not a production SDK command.
- SDK/toolchain baseline here: Flutter 3.41.6 / Dart 3.11.4. Production baseline is not frozen.
- Pigeon/native core will be added behind CallxBackend; the simulator must not become a
  production lifecycle implementation.

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
