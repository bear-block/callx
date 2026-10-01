# Callx React Native example

The example offers two explicitly labelled modes:

- **Simulator** works on web and in Expo Go, with in-memory state and no platform calls.
- **Device** is available in the generated development app. It uses the real Callx
  module, CallKit/Core-Telecom, native checkpoints and Android call notifications.
  Signaling is driven by local test controls. **Media is simulated: there is no audio.**
  Android receives FCM test pushes when Firebase is configured (below). iOS does not
  register PushKit; the Flutter example covers iOS push.

## Build and run

From this directory:

```sh
npm ci
npx expo prebuild --no-install
npx expo run:android
# or on macOS:
npx expo run:ios
```

`device-host/app.plugin.cjs` installs the example host into generated projects:
Android starts it in `Application.onCreate`; iOS starts it in AppDelegate. Do not edit
those generated files as the source of truth. The plugin's checked-in Swift/Kotlin
sources live in `device-host/`. This plugin is only for the example, not part of the
published SDK's Expo plugin.

Native startup completes checkpoint recovery before JS setup. A JS reload reattaches
to the same native runtime and does not terminate the call. A new process terminates
lost calls using the recovery policy in [ADR-0007](https://bear-block.github.io/callx/project/decisions).
Bootstrap errors remain visible in Device mode; they do not select a simulator silently.

Use an iPhone for real iOS lifecycle trials. The iOS Simulator can terminate CallKit
calls immediately; it remains useful for build and fake-provider regression tests.

## Android push (FCM)

1. Put the Firebase project's `google-services.json` in `packages/secrets/`. Git ignores
   it. Its Android app must be `dev.bearblock.callx`, the package in `app.json`.
2. Regenerate the native project so the plugin copies the file and applies the Google
   Services plugin: `npx expo prebuild --clean --no-install`, then `npx expo run:android`.
3. In Device mode, the Native host section shows the FCM token. Send a test invitation
   from the repository root:

   ```sh
   npm run push:test -- android --service-account ~/secrets/callx-sa.json --token <FCM token>
   ```

   `--message end` and `--message accept` work as in the
   [Flutter example](../../flutter/example/README.md#android-push-fcm).

Or run `npm run call:console` from the repository root and open http://127.0.0.1:8787 to
invite, answer, end and track calls from a browser; see the
[Flutter example](../../flutter/example/README.md#call-console).

The Flutter example uses the same package, so installing one replaces the other.

## Trial

1. Select **Device**. Tap **Permissions** on Android.
2. Tap **Incoming call**. Answer from the app or Android notification/system UI.
3. Tap **Connect media** to simulate readiness, then exercise mute, hold/resume and end.
4. Test decline, remote end and outgoing → remote answer separately.
5. Inspect the native host log and event timeline. Operation results display their actual
   status and execution mode, including rejection/timeout instead of claiming success.

Switching modes is disabled during a live call. Native calls cannot be reset with the
simulator's reset button. Android audio endpoint controls route through Telecom;
selecting a route does not create an audio stream in this harness.

For web preview: `npm run web`. For validation: `npm run typecheck` and `npm run build:web`.
Device results must be recorded separately from builds and simulator results using the
[evidence template](https://bear-block.github.io/callx/project/status).
