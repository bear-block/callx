---
title: "Flutter quick start"
description: "Install callx in a Flutter app, bootstrap the native core and receive your first call."
---

# Flutter quick start

This page takes a Flutter app from nothing to a ringing incoming call: steps 1 to 3 of
[Get started](/guide/). Allow about 30 minutes, most of it for Apple and Firebase push setup.

## 1. Install

```sh
flutter pub add callx
```

Set Android's minimum SDK to 29 in `android/app/build.gradle.kts`; the Flutter template's
default is lower and the build fails below Callx's floor:

```kotlin
android {
    defaultConfig {
        minSdk = 29
    }
}
```

iOS installs through Swift Package Manager or CocoaPods automatically. The deployment target
must be iOS 15 or later.

## 2. Configure the native projects

<!--@include: ./parts/native-config.md-->

## 3. Bootstrap the native core

The core must start when the process starts, before any push can arrive and before the Flutter
engine exists. That is why this step is native code. It is short.

### Android: `Application`

```kotlin
// android/app/src/main/kotlin/com/example/calls/App.kt
package com.example.calls

import android.app.Application
import com.google.firebase.messaging.FirebaseMessaging
import dev.callx.flutter.CallxPlugin
import dev.callx.telecom.CallxBootstrapConfig
import dev.callx.telecom.CallxPushTokens

class App : Application() {
    override fun onCreate() {
        super.onCreate()
        try {
            CallxPlugin.bootstrap(this, CallxBootstrapConfig(
                accountGeneration = AccountStore.generation(this),
            ))
        } catch (error: Exception) {
            // No Telecom on this device, or a storage error: report calling as unavailable.
            return
        }
        FirebaseMessaging.getInstance().token.addOnSuccessListener(CallxPushTokens::updateFcm)
    }
}
```

Register it with `android:name=".App"` on the `<application>` element.

### Android: forward FCM messages

<!--@include: ./parts/fcm-service.md-->

::: warning One messaging service
Android delivers FCM messages to a single service. If another plugin, such as
`firebase_messaging`, declares its own, make sure Callx invitations still reach
`handlePush`. Confirm it on a device with the [testkit](/guides/testing).
:::

### iOS: `AppDelegate`

```swift
// ios/Runner/AppDelegate.swift
import Flutter
import UIKit
import callx

@main
@objc class AppDelegate: FlutterAppDelegate {
  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    var config = CallxBootstrapConfig()
    config.accountGeneration = AccountStore.generation()
    do {
      _ = try CallxPlugin.bootstrap(config)   // Starts PushKit once recovery finishes.
    } catch {
      // Storage error: report calling as unavailable.
    }
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }
}
```

Callx owns the `PKPushRegistry`, reports every VoIP push to CallKit before the handler returns,
and records the VoIP token for `Callx.pushToken()`.

::: tip accountGeneration
A string that identifies the signed-in account on this device, for example a value you
generate at sign-in and store. Callx keeps each generation's calls separate, so results from
a previous login are never mistaken for the current one. Rotate it on sign-out. A fixed value
such as `"default"` is fine for apps without accounts.
:::

## 4. Use it from Dart

```dart
import 'package:callx/callx.dart';

final callx = Callx();

Future<void> startCalling() async {
  final capabilities = await callx.setup();
  if (!capabilities.nativeCalling) return; // Bootstrap failed or the device has no Telecom.

  // Send this to your backend so it can push invitations to this device.
  final token = await callx.pushToken(); // PushToken(type: 'voip' | 'fcm', token: ...)
  await api.registerPushToken(token!.type, token.token);

  // Your UI follows the native state; it never has to guess.
  callx.snapshots.listen((snapshot) {
    final call = snapshot.call;
    if (call == null) return showIdle();
    switch (call.state) {
      case CallState.incoming:   showIncoming(call);
      case CallState.connecting: showConnecting(call);
      case CallState.active:     showInCall(call);
      case CallState.held:       showOnHold(call);
      case CallState.ended:      showEnded(call.endReason);
      case CallState.outgoing:   showDialing(call);
    }
  });
}

Future<void> answer(String callId) async {
  final result = await callx.answer(callId);
  if (result.status != CommandStatus.applied) {
    showError(result.error?.message);
  }
}
```

Ask for the microphone permission (and notifications on Android 13+) while the app is in use,
before the first call: the permission prompt cannot appear over the lock screen.

## 5. Send a test call

Push an invitation from your backend, or from your machine with the testkit:

<!--@include: ./parts/test-push.md-->

The [backend guide](/backend/reference) has the exact APNs and FCM payloads. Kill the app, send
the push, and the phone rings with the system call UI.

## Next steps

The phone rings. Continue with [Get started, step 4](/guide/#_4-add-audio-and-video): add audio
with the LiveKit adapter, then connect outgoing calls and backend events in
[step 5](/guide/#_5-connect-your-backend-both-ways).

- Prefer ready-made screens? The [call overlay and mini-call](/guide/call-ui) render the call
  for you.
- [Dart API reference](/reference/dart).
