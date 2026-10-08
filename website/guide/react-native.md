---
title: "React Native quick start"
description: "Install @bear-block/callx in a React Native CLI app, bootstrap the native core and receive your first call."
---

# React Native quick start

This page takes a React Native CLI (bare) app to a ringing incoming call: steps 1 to 3 of
[Get started](/guide/). Using Expo? The [Expo quick start](/guide/expo) does all the native
steps below for you.

Callx supports React Native 0.76 and later, on the New Architecture (as a typed TurboModule)
and on the legacy architecture.

## 1. Install

```sh
npm install @bear-block/callx
cd ios && pod install
```

Raise Android's minimum SDK to 29 in `android/build.gradle`; the React Native template
defaults to 24:

```groovy
buildscript {
    ext {
        minSdkVersion = 29
    }
}
```

The package contains native code, so rebuild the app; a JavaScript reload is not enough.

## 2. Configure the native projects

<!--@include: ./parts/native-config.md-->

## 3. Bootstrap the native core

The core starts with the process, before any push arrives and before the JavaScript bundle
loads.

### Android: `MainApplication`

```kotlin
// android/app/src/main/java/com/example/calls/MainApplication.kt
import com.google.firebase.messaging.FirebaseMessaging
import dev.callx.reactnative.CallxModule
import dev.callx.telecom.CallxPushTokens

class MainApplication : Application(), ReactApplication {
    override fun onCreate() {
        super.onCreate()
        try {
            CallxModule.bootstrap(this)
            FirebaseMessaging.getInstance().token.addOnSuccessListener(CallxPushTokens::updateFcm)
        } catch (error: Exception) {
            // No Telecom on this device, or a storage error: calling is unavailable.
        }
        // …the rest of the template's onCreate (loadReactNative, etc.)
    }
}
```

Pass a `CallxBootstrapConfig` as the second argument to set an `accountGeneration`, a listener
or your own media. See [native host integration](/guides/native-host).

### Android: forward FCM messages

<!--@include: ./parts/fcm-service.md-->

::: tip Using @react-native-firebase/messaging?
Extend its service instead of `FirebaseMessagingService`, so your other messages still reach
JavaScript: `class MessagingService : ReactNativeFirebaseMessagingService()`, call
`super.onMessageReceived(message)` for non-Callx messages, and replace its manifest entry with
yours (`tools:node="replace"`). The Expo plugin generates exactly this.
:::

### iOS: `AppDelegate`

Add two lines at the top of `application(_:didFinishLaunchingWithOptions:)`, before the
template starts React Native:

```swift
// ios/Example/AppDelegate.swift
import callx_react_native

func application(
  _ application: UIApplication,
  didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
) -> Bool {
  do {
    try CallxReactNativeHost.bootstrap(CallxBootstrapConfig())
  } catch {
    NSLog("Callx: calling is unavailable: \(error)")
  }
  // …the template's code that starts React Native
}
```

Callx owns the `PKPushRegistry`, reports each VoIP push to CallKit before the handler returns,
and records the VoIP token for `getPushToken()`.

## 4. Use it from JavaScript

Keep one `Callx` instance for the whole app, for example in a module or a context provider.

```ts
import {Callx} from '@bear-block/callx';

export const callx = new Callx();

export async function startCalling() {
  const capabilities = await callx.setup();
  if (!capabilities.nativeCalling) return; // Bootstrap failed or no Telecom.

  // Send this to your backend so it can push invitations to this device.
  const token = await callx.getPushToken(); // {type: 'voip' | 'fcm', token}
  if (token) await api.registerPushToken(token.type, token.token);

  // Your UI follows the native state.
  return callx.observe(({call}) => {
    if (!call) return showIdle();
    switch (call.state) {
      case 'incoming':   return showIncoming(call);
      case 'connecting': return showConnecting(call);
      case 'active':     return showInCall(call);
      case 'held':       return showOnHold(call);
      case 'ended':      return showEnded(call.endReason);
      case 'outgoing':   return showDialing(call);
    }
  });
}

export async function answer(callId: string) {
  const result = await callx.answer(callId);
  if (result.status !== 'applied') showError(result.error?.message);
}
```

Ask for the microphone permission (and notifications on Android 13+) while the app is in use,
before the first call arrives.

## 5. Send a test call

Push an invitation from your backend, or from your machine with the testkit:

<!--@include: ./parts/test-push.md-->

Kill the app, send the push, and the phone rings. The [backend guide](/backend/reference) has the
payloads your server sends in production.

## Next steps

The phone rings. Continue with [Get started, step 4](/guide/#_4-add-audio-and-video): add audio
with the LiveKit adapter, then connect outgoing calls and backend events in
[step 5](/guide/#_5-connect-your-backend-both-ways).

- Prefer ready-made screens? The [call overlay and mini-call](/guide/call-ui) render the call
  for you.
- [TypeScript API reference](/reference/javascript).
