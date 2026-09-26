# Callx Flutter example

The example has two modes.

- **Simulator** runs everywhere, including web and tests. Everything is in memory: no
  system call UI, push, microphone or audio.
- **Device** appears on Android and iOS builds of this example, because its native host
  configures the Callx runtime at launch (`android/app/src/main/kotlin/.../CallHost.kt`,
  `ios/Runner/AppDelegate.swift`). Push delivery, CallKit, Core-Telecom and the Android
  call notification are real. There is no signaling backend or media engine, so the
  example host stands in for the remote side and **media is simulated: there is no audio**.

## Device trial without push

Install on a phone and open the app; it starts in Device mode. Android emulators run
Core-Telecom; the iOS Simulator ends every CallKit call as soon as it starts, so use an
iPhone for iOS trials.

```sh
fvm flutter run -d <device-id>
```

Tap **Permissions**, then **Incoming (local signaling)**. The invitation takes the same
native path as a push: the coordinator decides whether it may ring, then CallKit or
Telecom rings and Android posts its call notification. Answer from the system UI or the
notification, tap **Media connected (simulated)**, then hang up. The host log on screen
and `adb logcat -s CallxExample` (Android) or the Xcode console filtered by
`CallxExample` (iOS) show every callback.

The same flows run automatically against the platform:

```sh
fvm flutter test integration_test/device_trial_test.dart -d <device-id>
```

## Android push (FCM)

1. In the Firebase console, add an Android app with package
   `dev.callx.preview.callx_flutter_example`. Download `google-services.json` into
   `android/app/`. Git ignores it; the build applies the Google Services plugin only
   when it is present.
2. Rebuild and install. The Push section shows the FCM token; copy it.
3. In Project settings → Service accounts, generate a private key. Keep the JSON file
   outside this repository.
4. From the repository root, send an invitation:

   ```sh
   npm run push:test -- android --service-account ~/secrets/callx-sa.json --token <FCM token>
   ```

   The output includes the call ID. Without a signaling socket, the example accepts two
   test signals over FCM data (test harness only; real apps use their signaling channel):

   ```sh
   npm run push:test -- android ... --message end --call-id <id> --reason callerCancelled
   npm run push:test -- android ... --message accept --call-id <id>
   ```

Invitations expire after 30 seconds by default (`--expires-in`); the call then ends as
missed. The host log reports when FCM deprioritized a message.

## iOS push (PushKit)

The Simulator cannot receive VoIP pushes; use a device.

1. In Xcode, open `ios/Runner.xcworkspace`, select your team for Runner, and add the
   **Push Notifications** capability. `Info.plist` already declares the `voip` and
   `audio` background modes.
2. In the Apple Developer account, create an APNs authentication key (`.p8`) and note
   its key ID and your team ID. Keep the key outside this repository.
3. Run on the device. The Push section shows the VoIP token; copy it.
4. Send an invitation (add `--production` for a TestFlight or App Store build):

   ```sh
   npm run push:test -- ios --key ~/secrets/AuthKey_KEY123.p8 --key-id KEY123 \
     --team-id TEAM123 --bundle-id dev.callx.preview.callxFlutterExample --token <VoIP token>
   ```

A VoIP push carries invitations only. End or cancel the call with the example's buttons,
which call the same ingress methods a signaling client would.

## Scenarios

Run these on each platform, locked and unlocked, with the app in the foreground, in the
background and not running. Record results with the
[evidence template](../../../docs/evidence/README.md); a scenario passes only with a trace.

| ID | Steps | Expect |
|---|---|---|
| S-01 | Invite → answer → Media connected → end | Rings, answers, ends, notification removed |
| S-02 | Invite → decline | Ends as `declined` |
| S-03 | Invite → wait past `expiresAtMs` | Ends as `unanswered` |
| S-04 | Invite → Caller cancels (or `--message end`) | Ringing stops, `callerCancelled` |
| S-11 | Send the same `--call-id` again after it ended | Does not ring again |
| S-12 | Lock the phone → invite → answer on the lock screen | Answers without unlocking |

The full matrix is in [the test plan](../../../docs/plan/03-test-matrix.md).
