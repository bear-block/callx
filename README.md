# 📞 Callx - React Native Incoming Call Library

**Beautiful React Native incoming call UI with Firebase Cloud Messaging integration**

[![npm version](https://img.shields.io/npm/v/@bear-block/callx/beta.svg)](https://www.npmjs.com/package/@bear-block/callx)  
[![license](https://img.shields.io/npm/l/@bear-block/callx.svg)](https://www.npmjs.com/package/@bear-block/callx)  
[![GitHub stars](https://img.shields.io/github/stars/bear-block/callx.svg?style=social&label=Star)](https://github.com/bear-block/callx)  
[![GitHub Sponsors](https://img.shields.io/badge/Sponsor-%E2%9D%A4-red.svg)](https://github.com/sponsors/bear-block)

<table>
  <tr>
    <td align="center">
      <img src="https://raw.githubusercontent.com/bear-block/callx/main/example/docs/assets/incoming-call-background.gif" width="324" /><br/>
      <b>When app is in background</b>
    </td>
    <td align="center">
      <img src="https://raw.githubusercontent.com/bear-block/callx/main/example/docs/assets/incoming-call-lockscreen.gif" width="324" /><br/>
      <b>When device is on lock screen</b>
    </td>
  </tr>
</table>

---

## ✨ Features

- 📱 **Cross-platform**: iOS & Android support
- 🍎 **iOS**: Complete iOS support with CallKit & PushKit
- 🤖 **Android**: Custom incoming call UI with FCM
- 🔔 **Push Notifications**: Firebase Cloud Messaging (FCM)
- 🎥 **Video call support** for both platforms
- 📋 **Call logging** to phone's native call history
- ⚙️ **Configuration**: via Android `AndroidManifest.xml` meta-data and iOS `Info.plist` (no `callx.json`)
- 🚀 **Expo plugin** for automatic configuration
- 🔧 **TypeScript**: Full TypeScript support

### 📋 Platform Support

| Feature | iOS | Android |
|---------|-----|---------|
| Native UI | ✅ CallKit | ✅ Custom |
| Push Notifications | ✅ PushKit | ✅ FCM |
| Lock Screen | ✅ Native | ✅ Custom |
| Video Calls | ✅ Native | ✅ Native |
| Call Logging | ✅ Native | ✅ Native |
| Background Processing | ✅ Native | ✅ Native |

### 🚀 Support Development

If this library helps you, please consider supporting its development:

- ⭐ **Star this repo** - [GitHub](https://github.com/bear-block/callx)
- 💖 **Sponsor on GitHub** - [GitHub Sponsors](https://github.com/sponsors/bear-block)
- ☕ **Buy me a coffee** - [Buy Me a Coffee](https://www.buymeacoffee.com/bearblock)

---

## ⚡ Quick Setup

> **⚠️ IMPORTANT:** Ensure you have completed the [React Native Firebase with Messaging setup guide](https://rnfirebase.io/) first.

### 📦 Install

```bash
npm install @bear-block/callx
```

```bash
yarn add @bear-block/callx
```

**Important:** The `package` option is required and must match your Android package name exactly.

### React Native CLI Setup

### 1. Android Setup

#### Always required

In `MainActivity.kt`, extend `CallxReactActivity`:

```kotlin
import com.callx.CallxReactActivity

class MainActivity : CallxReactActivity() {
  // ...
}
```

### 2. iOS Setup

#### Background Modes

Add to `ios/YourApp/Info.plist`:

```xml
<key>UIBackgroundModes</key>
<array>
    <string>voip</string>
    <string>remote-notification</string>
    <string>background-fetch</string>
</array>
```

#### Privacy Descriptions

```xml
<key>NSMicrophoneUsageDescription</key>
<string>This app needs microphone access for calls</string>
<key>NSCameraUsageDescription</key>
<string>This app needs camera access for video calls</string>
```

#### iOS Background Modes & Privacy

**Background modes and privacy descriptions are automatically included in the library.** If you're using the Expo plugin, no manual setup is required.

For manual setup, add to `ios/YourApp/Info.plist`:

```xml
<key>UIBackgroundModes</key>
<array>
    <string>voip</string>
    <string>remote-notification</string>
</array>
```

### 3. Configure Triggers & Fields (no `callx.json`)

Configuration now lives in native files.

#### Android: `AndroidManifest.xml` (inside `<application>`)

```xml
<!-- Triggers: which FCM data indicates each event -->
<meta-data android:name="callx.triggers.incoming.field" android:value="type" />
<meta-data android:name="callx.triggers.incoming.value" android:value="call.started" />
<meta-data android:name="callx.triggers.ended.field" android:value="type" />
<meta-data android:name="callx.triggers.ended.value" android:value="call.ended" />
<meta-data android:name="callx.triggers.missed.field" android:value="type" />
<meta-data android:name="callx.triggers.missed.value" android:value="call.missed" />
<meta-data android:name="callx.triggers.answered_elsewhere.field" android:value="type" />
<meta-data android:name="callx.triggers.answered_elsewhere.value" android:value="call.answered_elsewhere" />

<!-- Fields: where to read values from in FCM data -->
<meta-data android:name="callx.fields.callId" android:value="callId" />
<meta-data android:name="callx.fields.callerName" android:value="callerName" />
<meta-data android:name="callx.fields.callerPhone" android:value="callerPhone" />
<meta-data android:name="callx.fields.callerAvatar" android:value="callerAvatar" />
<meta-data android:name="callx.fields.hasVideo" android:value="hasVideo" />

<!-- Recommended permissions for full-screen call UI and notifications -->
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
<uses-permission android:name="android.permission.USE_FULL_SCREEN_INTENT" />
```

Notes:
- Put the `<meta-data>` entries inside your app `<application>` tag.
- Field paths are flat by default (e.g. `type`, `callId`). If your payload nests fields, set paths accordingly (e.g. `data.type`).

#### iOS: `Info.plist`

```xml
<key>CallxTriggers</key>
<dict>
  <key>incoming</key>
  <dict>
    <key>field</key><string>type</string>
    <key>value</key><string>call.started</string>
  </dict>
  <key>ended</key>
  <dict>
    <key>field</key><string>type</string>
    <key>value</key><string>call.ended</string>
  </dict>
  <key>missed</key>
  <dict>
    <key>field</key><string>type</string>
    <key>value</key><string>call.missed</string>
  </dict>
  <key>answered_elsewhere</key>
  <dict>
    <key>field</key><string>type</string>
    <key>value</key><string>call.answered_elsewhere</string>
  </dict>
  
  <!-- Optional: token event name etc. -->
</dict>

<key>CallxFields</key>
<dict>
  <key>callId</key><string>callId</string>
  <key>callerName</key><string>callerName</string>
  <key>callerPhone</key><string>callerPhone</string>
  <key>callerAvatar</key><string>callerAvatar</string>
  <key>hasVideo</key><string>hasVideo</string>
</dict>
```

### 4. Initialize in JS

Callx should be initialized as early as possible in your app's lifecycle (e.g., `index.js`). The module buffers events when the app is killed/backgrounded and flushes them on initialize:

```ts
// index.js - Initialize before app renders
import Callx from '@bear-block/callx';

// Initialize Callx before app starts
Callx.initialize({
  onIncomingCall: (data) => {
    // Called when incoming call displayed
  },
  onCallAnswered: (data) => {
    // Called when call is accepted by user
  },

  onCallEnded: (data) => {
    // Called when call ends
  },
  onCallMissed: (data) => {
    // Called when call is missed
  },
  onCallAnsweredElsewhere: (data) => {
    // Called when call is answered on another device
  },
  onTokenUpdated: (tokenData) => {
    // Called when VoIP | FCM token updates
    console.log('VoIP token:', tokenData.token);
  },
});

// Then register your app
AppRegistry.registerComponent(appName, () => App);
```

---

## 📱 Expo Setup

### 1. Add Plugin to `app.json`

Add the plugin to your `app.json`:

```json
{
  "expo": {
    "plugins": [
      ["@bear-block/callx", { "package": "your.package.name" }]
    ]
  }
}
```

The plugin will automatically:
- Inject `<meta-data>` config into `AndroidManifest.xml`
- Update `MainActivity` to extend `CallxReactActivity` (Android)
- Inject `CallxTriggers` and `CallxFields` into `Info.plist` (iOS)
- Add required background modes and privacy strings (iOS)

### 2. Configure triggers/fields

Use plugin options or edit the native files as above. No `callx.json` is required.

### 3. Initialize in JS

Same initialization code as React Native CLI (in `index.js`).

### 4. Build with EAS

```bash
eas build --platform android
eas build --platform ios
```

> **💡 Note:** Expo development builds are required for native modules like Callx.

---

## 🎥 Video Call Support

Callx now supports both voice and video calls:

**Push Notification Payload:**
```json
{
  "data": {
    "type": "call.started",
    "callId": "call-123",
    "callerName": "John Doe",
    "callerPhone": "+1234567890",
    "hasVideo": true  // or false for voice calls
  }
}
```

**Configuration:**
```json
{
  "app": {
    "supportsVideo": true  // Enable video call support
  }
}
```

**Call Data Structure:**
```typescript
interface CallData {
  callId: string;
  callerName: string;
  callerPhone: string;
  callerAvatar?: string;
  hasVideo?: boolean;  // true for video calls, false for voice calls
}
```

---

## 🔥 FCM & iOS VoIP Integration

### Android (FCM)

Callx automatically handles FCM messages for Android. Just send a data-only message (flat keys by default to match manifest/plist):

```json
{
  "data": {
    "type": "call.started",
    "callId": "call-123",
    "callerName": "John Doe",
    "callerPhone": "+1234567890",
    "hasVideo": "false"
  }
}
```

Other events:

```json
{
  "data": { "type": "call.ended", "callId": "call-123" }
}
{
  "data": { "type": "call.missed", "callId": "call-123" }
}
{
  "data": { "type": "call.answered_elsewhere", "callId": "call-123" }
}
```

### iOS (VoIP Push)

For iOS, you need to send VoIP push notifications using the VoIP token:

```typescript
// Get VoIP token
const voipToken = await Callx.getVoIPToken();

// Listen for token updates
Callx.initialize({
  onTokenUpdated: (tokenData) => {
    console.log('VoIP token updated:', tokenData.token);
    // Send this token to your server for VoIP pushes
  }
});
```

**VoIP Push Payload:**
```json
{
  "data": {
    "type": "call.started",
    "callId": "call-123",
    "callerName": "John Doe",
    "callerPhone": "+1234567890",
    "hasVideo": true
  }
}
```

---

## 🚀 Advanced Usage

### Manual Call Display

You can manually trigger call UI from your JS code:

```ts
import Callx from '@bear-block/callx';

// Show incoming call manually
Callx.showIncomingCall({
  callId: 'manual-call-123',
  callerName: 'John Doe',
  callerPhone: '+1234567890',
  callerAvatar: 'https://example.com/avatar.jpg',
  hasVideo: true, // Video call support
});
```

### Token Management

Get tokens for your server:

```ts
// FCM Token (Android)
const fcmToken = await Callx.getFCMToken();
console.log('FCM Token:', fcmToken);

// VoIP Token (iOS)
const voipToken = await Callx.getVoIPToken();
console.log('VoIP Token:', voipToken);
```

### Call Status Management

```ts
// Check if call is active
const isActive = await Callx.isCallActive();

// Get current call data
const currentCall = await Callx.getCurrentCall();

// End current call
await Callx.endCall('call-id');

// Answer call
await Callx.answerCall('call-id');

// Decline call
await Callx.declineCall('call-id');
```

### Manual FCM Handling

If you're using JS mode, handle FCM messages manually:

```ts
import messaging from '@react-native-firebase/messaging';

messaging().onMessage(async (remoteMessage) => {
  // Handle FCM message manually
  await Callx.handleFcmMessage(remoteMessage.data);
});
```

---


### **Event Listeners**
```ts
Callx.initialize({
  // Call state events
  onIncomingCall: (data) => {
    console.log('Incoming call:', data);
  },
  onCallAnswered: (data) => {
    console.log('Call answered:', data);
  },
  onCallDeclined: (data) => {
    console.log('Call declined:', data);
  },
  onCallEnded: (data) => {
    console.log('Call ended:', data);
  },
  onCallMissed: (data) => {
    console.log('Call missed:', data);
  },
  onCallAnsweredElsewhere: (data) => {
    console.log('Call answered elsewhere:', data); // closes UI like missed
  },
  onTokenUpdated: (tokenData) => {
    console.log('FCM token updated:', tokenData.token);
  },
});
```

---

## 🔧 Troubleshooting

### Common Issues

**FCM not working?**

- ✅ Check `google-services.json` is in `android/app/`
- ✅ Verify Firebase project settings
- ✅ Test with real device (not simulator)
- ✅ Ensure React Native Firebase is properly installed
- ✅ Check Firebase dependencies are added to Gradle files

**iOS VoIP not working?**

- ✅ Test with real device (VoIP doesn't work in simulator)
- ✅ Check Info.plist has voip background mode
- ✅ Verify VoIP certificate in Apple Developer Console
- ✅ Ensure VoIP push payload is correct

**callx.json not loaded?**

- ✅ Place in project root (not in android folder)
- ✅ Verify file format is valid JSON
- ✅ Rebuild app after changes

**Native UI not showing?**

- ✅ Check FCM configuration
- ✅ Verify `callx.json` is properly loaded
- ✅ Ensure MainActivity extends CallxReactActivity

**Build errors?**

- ✅ Clean and rebuild: `cd android && ./gradlew clean`
- ✅ Check Android logs: `adb logcat | grep Callx`
- ✅ Check iOS logs in Xcode console

### Debug Mode

```ts
// Check current state
console.log('Active call:', await Callx.getCurrentCall());
console.log('FCM token:', await Callx.getFCMToken());
console.log('VoIP token:', await Callx.getVoIPToken());
```

---

## 🔔 Notification Configuration

Callx uses hardcoded notification settings for consistent behavior across all installations:

### Android Notification Channel
- **Channel ID**: `callx_incoming_calls`
- **Channel Name**: `Incoming Calls`
- **Description**: `Incoming call notifications with ringtone`
- **Importance**: `high`
- **Sound**: `default`

### iOS Push Notifications
- **Category**: VoIP push notifications
- **Sound**: Default system sound
- **Priority**: High priority for immediate delivery

> **Note:** These settings are built into the native module and cannot be customized. This ensures consistent notification behavior across all Callx installations.

---

## 📖 API Reference

### Methods

| Method                                   | Description                               | Platform |
| ---------------------------------------- | ----------------------------------------- | -------- |
| `initialize(config)`                     | Initialize Callx with event listeners     | Both |
| `showIncomingCall(data)`                 | Manually display incoming call UI         | Both |
| `handleFcmMessage(data)`                 | Handle FCM message manually (for JS mode) | Both |
| `answerCall(callId)`                     | Answer current call                       | Both |
| `declineCall(callId)`                    | Decline current call                      | Both |
| `endCall(callId)`                        | End current call                          | Both |
| `getFCMToken()`                    | Get current FCM token              | Both |
| `getVoIPToken()`                   | Get current VoIP token (iOS)      | iOS  |
| `getCurrentCall()`                 | Get current active call data      | Both |
| `isCallActive()`                   | Check if call is active           | Both |
| `hideFromLockScreen()`             | Hide app from lock screen         | Android |
| `moveAppToBackground()`            | Move app to background            | Android |

### Event Callbacks

| Event                       | Description                            |
| --------------------------- | -------------------------------------- |
| `onIncomingCall`           | Triggered when incoming call displayed |
| `onCallAnswered`           | User answered the call                 |
| `onCallDeclined`           | User rejected the call                 |
| `onCallEnded`              | Call ended after it was answered       |
| `onCallMissed`             | Call was missed (no response)          |
| `onCallAnsweredElsewhere` | Call answered on another device  |
| `onTokenUpdated`                | VoIP or FCM token was updated            | Both |

---

## 🎯 Best Practices

### 📱 App Architecture

**Recommended Setup:**

```ts
// index.js - Initialize before app renders
import Callx from '@bear-block/callx';

// Initialize Callx before app starts
Callx.initialize({
  onIncomingCall: (data) => {
    // Navigate to call screen or show notification
    // Note: navigation might not be available here
    console.log('📞 Incoming call:', data);
  },
  onCallAnswered: (data) => {
    // Handle call answered - start your call logic
    console.log('✅ Call answered:', data);
  },
  onCallDeclined: (data) => {
    // Handle call declined - user rejected the call
    console.log('❌ Call declined:', data);
  },
  // Handle call end scenarios
  onCallAnsweredElsewhere: (data) => {
    console.log('📱 Answered elsewhere:', data);
    // Hide current call UI, show "answered elsewhere" message
  },
});

// Then register your app
AppRegistry.registerComponent(appName, () => App);
```

### 🔒 Lock Screen Call Handling

**End Call from Lock Screen:**

```ts
// Handle end call when app is in background/lock screen
Callx.initialize({
  onCallAnswered: (data) => {
    // Start your call session
    startCallSession(data);
  },
  onCallEnded: (data) => {
    // Call ended - clean up resources
    endCallSession(data);

    // If app was launched from lock screen, you might want to:
    // 1. Hide from lock screen (Android)
    if (Platform.OS === 'android') {
      Callx.hideFromLockScreen();
      Callx.moveAppToBackground();
    }
  },
});

// Manual end call handling
import { AppState, Platform } from 'react-native';

const handleEndCall = async (callId) => {
  try {
    // End call in your app
    await endCallInYourApp(callId);

    // End call in Callx
    await Callx.endCall(callId);

    // Check if app is in background (likely from lock screen)
    const appState = AppState.currentState;
    if (Platform.OS === 'android' && (appState === 'background' || appState === 'inactive')) {
      // Only cleanup if app was in background
      await Callx.hideFromLockScreen();
      await Callx.moveAppToBackground();
    }
  } catch (error) {
    console.error('Error ending call:', error);
  }
};
```