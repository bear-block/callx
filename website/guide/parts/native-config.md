### iOS

In Xcode, under **Signing & Capabilities** for the app target:

- Add **Push Notifications**.
- Add **Background Modes** and tick **Audio, AirPlay, and Picture in Picture** and
  **Voice over IP**.

Add a microphone description to the app's `Info.plist` (`ios/Runner/Info.plist` in Flutter):

```xml
<key>NSMicrophoneUsageDescription</key>
<string>Example uses the microphone for calls.</string>
```

### Android

Callx's own manifest already declares `MANAGE_OWN_CALLS`, `USE_FULL_SCREEN_INTENT` and its
incoming-call screen. Add the permissions your app requests at runtime to
`android/app/src/main/AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
```

Add Firebase to the Android app as usual: `google-services.json`, the Google Services Gradle
plugin and the `com.google.firebase:firebase-messaging` dependency.
