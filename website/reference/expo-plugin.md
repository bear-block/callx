---
title: "Expo config plugin"
description: "Every option of the @bear-block/callx and @bear-block/callx-livekit config plugins and what they change."
---

# Expo config plugin

::: info Development reference
This page describes version 0.2.2 with contract 0.2.0, native video and Android PiP.
See [status](/project/status) for verification limits and [changelog](/project/changelog).
:::


```json
{
  "expo": {
    "plugins": [
      ["@bear-block/callx/app.plugin", { "iosVoip": true, "androidPush": "fcm" }],
      "@bear-block/callx-livekit/app.plugin"
    ]
  }
}
```

Use the explicit `app.plugin` path. The plugin rejects unknown options.

## `@bear-block/callx/app.plugin`

| Option | Type | Default | Effect |
|---|---|---|---|
| `microphonePermission` | `string` | Keeps existing text, or an English default | `NSMicrophoneUsageDescription` |
| `iosVoip` | `boolean` | `false` | Adds the `voip` background mode. Callx registers for VoIP pushes |
| `apsEnvironment` | `"development"` \| `"production"` | Unchanged | Sets the `aps-environment` entitlement. Requires `iosVoip: true`. Omit it if another plugin or your signing sets it |
| `androidNotifications` | `boolean` | `false` | Declares `POST_NOTIFICATIONS` |
| `androidPush` | `"none"` \| `"fcm"` | `"none"` | `"fcm"` generates `CallxMessagingService`, adds Firebase Messaging and declares the service. Requires `android.googleServicesFile` |
| `video` | `boolean` | `false` | Video calls: declares `CAMERA` with an optional camera feature, and adds `NSCameraUsageDescription`. See [video calls](/guide/video) |
| `cameraPermission` | `string` | Keeps existing text, or an English default | `NSCameraUsageDescription`. Requires `video: true` |
| `pictureInPicture` | `boolean` | `false` | Enables Android activity PiP and its layout configuration flags; see [video calls](/guide/video#picture-in-picture-on-android) |
| `bootstrap` | `boolean` | `true` | Starts the native core from `MainApplication.onCreate` and `didFinishLaunchingWithOptions`. Set `false` when your own native code bootstraps |

Always applied:

- iOS: the `audio` background mode.
- Android: `INTERNET`, `RECORD_AUDIO` and `MANAGE_OWN_CALLS`; `minSdkVersion` raised to 29 when
  lower (a higher value is kept).

The plugin preserves unrelated entries and deduplicates its additions. Setting an option back to
`false` does not remove entries other sources added; regenerate with `prebuild --clean` to check
removals.

### The generated messaging service

With `androidPush: "fcm"`, the plugin writes `CallxMessagingService` into your app's package. It:

- Forwards Callx invitations to the native ingress (`handlePush`).
- Reports FCM token refreshes to Callx (`CallxPushTokens.updateFcm`).
- If `@react-native-firebase/messaging` is installed, extends its service, replaces its manifest
  entry, and passes every non-Callx message on, so your JavaScript handlers keep working.

### What the plugin does not do

- Request runtime permissions (do it in your app while it is in use).
- Upload push tokens to your backend (`getPushToken()` gives you the token).
- Supply APNs or Firebase credentials.
- Install a media SDK (add an adapter plugin).
- Change the iOS deployment target (it must be 15 or later).

## `@bear-block/callx-livekit/app.plugin`

No options. It:

- Adds `CallxLiveKitAdapterFactory` to `CallxMediaAdapterFactories` in `Info.plist`.
- Adds a build phase that embeds LiveKit's WebRTC and Rust frameworks, which Swift Package
  Manager does not embed for React Native apps.

Expo's Android template already includes the JitPack repository that LiveKit's AudioSwitch
dependency needs. Place this plugin after Callx's.

## Inspect the result

```sh
npx expo config --type introspect
```
