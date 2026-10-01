---
title: "Expo quick start"
description: "Add Callx to an Expo app with the config plugin. No native code, including the FCM service."
---

# Expo quick start

With Expo, Callx needs no native code at all. The config plugin bootstraps the native core,
generates the Android FCM service and sets every permission and capability.

::: info Development build required
Callx contains native code, so it does not run in Expo Go. Use a
[development build](https://docs.expo.dev/develop/development-builds/introduction/)
(`npx expo run:ios`, `npx expo run:android` or EAS Build).
:::

## 1. Install

```sh
npx expo install @bear-block/callx
```

The plugin needs `@expo/config-plugins`, which Expo projects already have. Callx supports
Expo SDK 57.

## 2. Add the plugin

```json
{
  "expo": {
    "name": "Acme",
    "ios": {"bundleIdentifier": "com.acme.calls"},
    "android": {
      "package": "com.acme.calls",
      "googleServicesFile": "./google-services.json"
    },
    "plugins": [
      ["@bear-block/callx/app.plugin", {
        "microphonePermission": "Acme uses the microphone for calls.",
        "iosVoip": true,
        "apsEnvironment": "production",
        "androidNotifications": true,
        "androidPush": "fcm"
      }]
    ]
  }
}
```

This is what each option does; every option is described in the
[plugin reference](/reference/expo-plugin).

| Option | Effect |
|---|---|
| `microphonePermission` | Sets `NSMicrophoneUsageDescription` |
| `iosVoip` | Adds the `voip` background mode; Callx registers for VoIP pushes |
| `apsEnvironment` | Sets the APNs entitlement (`development` or `production`) |
| `androidNotifications` | Declares `POST_NOTIFICATIONS` |
| `androidPush: "fcm"` | Generates `CallxMessagingService`, which forwards Callx invitations to the native core and reports the FCM token |
| `bootstrap` (default `true`) | Starts the native core from `MainApplication` and `AppDelegate` |

The plugin also adds the iOS `audio` background mode, the Android `INTERNET`, `RECORD_AUDIO`
and `MANAGE_OWN_CALLS` permissions, and raises Android's `minSdkVersion` to 29.

If your app uses `@react-native-firebase/messaging`, the generated service extends that
library's service and passes your other messages on to it. Nothing else changes.

## 3. Build

```sh
npx expo prebuild
npx expo run:ios       # or: npx expo run:android
```

Check the merged configuration any time with `npx expo config --type introspect`.

## 4. Use it

```ts
import {Callx} from '@bear-block/callx';

export const callx = new Callx();

export async function startCalling() {
  const capabilities = await callx.setup({appName: 'Acme'});
  if (!capabilities.nativeCalling) return;

  const token = await callx.getPushToken(); // {type: 'voip' | 'fcm', token}
  if (token) await api.registerPushToken(token.type, token.token);

  return callx.observe(({call}) => render(call));
}
```

That is the whole integration. Send an invitation from your backend
([payloads](/guides/backend)) and the phone rings, even with the app killed.

## Add audio

Install the LiveKit adapter and add its plugin after Callx's:

```sh
npx expo install @bear-block/callx-livekit
```

```json
{
  "plugins": [
    ["@bear-block/callx/app.plugin", {"iosVoip": true, "androidPush": "fcm"}],
    "@bear-block/callx-livekit/app.plugin"
  ]
}
```

Then [configure credentials](/guide/livekit#configure-credentials) from JavaScript.

## When you need native code anyway

Set `"bootstrap": false` when you want to pass native options, such as a listener for your
backend, a custom notification presenter or your own media engine. Then call
`CallxModule.bootstrap(this, config)` on Android and `CallxReactNativeHost.bootstrap(config)`
on iOS yourself, from a [local Expo module](https://docs.expo.dev/modules/overview/) or a
config plugin of your own, so the code survives `prebuild --clean`. See
[native host integration](/guides/native-host).
