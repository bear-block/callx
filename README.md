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

> Note: Android flow has been tested end-to-end. iOS configuration is updated and aligned, but real-device VoIP push testing is still pending.

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

## 🔧 Configuration at a glance (Android, iOS, Expo plugin)

Purpose: let native detect call events from your push payload, map fields for the UI, and enable platform features — even when JS is not running.

- **Triggers**: define which incoming push type should trigger each call lifecycle event.
  - Keys: `incoming`, `ended`, `missed`, `answered_elsewhere`
  - Value format: `<field>:<value>` (e.g., `type:call.started`)
- **Fields mapping**: map fields from your push payload to Callx’s UI and logic.
  - Keys: `callId`, `callerName`, `callerPhone`, `callerAvatar`, `hasVideo`
  - Value format (Android): `<path>[:<fallback>]` (e.g., `callerName:Unknown Caller`)
  - Value format (iOS): `{ field: <path>, fallback?: <value> }` in `Info.plist`
- **App flags**:
  - `supportsVideo` (boolean): enable video-call affordances
  - `enabledLogPhoneCall` (boolean): write answered calls to the system call log (if allowed)

Runtime flow

- Android: FCM → match Trigger → show UI on lock screen → buffer events → JS receives after `Callx.initialize(...)`.
- iOS: VoIP push → CallKit UI via Triggers/Fields → buffer events → JS receives after `Callx.initialize(...)`.

Examples

- Android `AndroidManifest.xml` (inside `<application>`):

```xml
<!-- Triggers -->
<meta-data android:name="incoming" android:value="type:call.started" />
<meta-data android:name="ended" android:value="type:call.ended" />
<meta-data android:name="missed" android:value="type:call.missed" />
<meta-data android:name="answered_elsewhere" android:value="type:call.answered_elsewhere" />

<!-- Fields mapping -->
<meta-data android:name="callId" android:value="callId" />
<meta-data android:name="callerName" android:value="callerName:Unknown Caller" />
<meta-data android:name="callerPhone" android:value="callerPhone:No Number" />
<meta-data android:name="callerAvatar" android:value="callerAvatar" />
<meta-data android:name="hasVideo" android:value="hasVideo:false" />

<!-- App flags -->
<meta-data android:name="supportsVideo" android:value="true" />
<meta-data android:name="enabledLogPhoneCall" android:value="true" />
```

- iOS `Info.plist`:

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
</dict>

<key>CallxFields</key>
<dict>
  <key>callId</key>
  <dict>
    <key>field</key><string>callId</string>
  </dict>
  <key>callerName</key>
  <dict>
    <key>field</key><string>callerName</string>
    <key>fallback</key><string>Unknown Caller</string>
  </dict>
  <key>callerPhone</key>
  <dict>
    <key>field</key><string>callerPhone</string>
    <key>fallback</key><string>No Number</string>
  </dict>
  <key>callerAvatar</key>
  <dict>
    <key>field</key><string>callerAvatar</string>
  </dict>
  <key>hasVideo</key>
  <dict>
    <key>field</key><string>hasVideo</string>
    <key>fallback</key><string>false</string>
  </dict>
</dict>

<key>CallxApp</key>
<dict>
  <key>supportsVideo</key><true/>
  <key>enabledLogPhoneCall</key><true/>
</dict>
```

 - Expo plugin: see the full `app.json` example in the Expo Setup section below.

Payloads must match your mapping. See the Android/iOS payload examples in the FCM & iOS VoIP Integration section below.

## ⚡ Quick Setup

> **⚠️ IMPORTANT:** Ensure you have completed the [React Native Firebase with Messaging setup guide](https://rnfirebase.io/) first.

### 📦 Install

```bash
npm install @bear-block/callx
```

```bash
yarn add @bear-block/callx
```

 

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

Permissions required for full-screen incoming UI and notifications are declared by the library; no manual manifest changes are needed.

### 2. iOS Setup

If you use the Expo plugin, required background modes and privacy strings are injected automatically. For React Native CLI, ensure `UIBackgroundModes` includes `voip` and `remote-notification` in your `Info.plist`.


### 3. Configure Triggers & Fields

Configuration now lives in native files.

See examples in the Configuration section above for Android `AndroidManifest.xml`, iOS `Info.plist`, and Expo plugin options.

Notes:
- Put the Android `<meta-data>` entries inside your app `<application>` tag.
- Ensure your server payload matches your mapping (e.g., `type=call.started`).

### 4. Initialize in JS

Initialize as early as possible (e.g., `index.js`). Native buffers events when the app is killed/backgrounded and flushes them on initialize:

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
  onCallDeclined: (data) => {
    // Called when call is declined by user
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
      [
        "@bear-block/callx",
        {
          "package": "your.package.name",
          "triggers": {
            "incoming": { "field": "type", "value": "call.started" },
            "ended": { "field": "type", "value": "call.ended" },
            "missed": { "field": "type", "value": "call.missed" },
            "answered_elsewhere": { "field": "type", "value": "call.answered_elsewhere" }
          },
          "fields": {
            "callId": { "field": "callId" },
            "callerName": { "field": "callerName", "fallback": "Unknown Caller" },
            "callerPhone": { "field": "callerPhone", "fallback": "No Number" },
            "callerAvatar": { "field": "callerAvatar" },
            "hasVideo": { "field": "hasVideo", "fallback": "false" }
          },
          "app": { "supportsVideo": true, "enabledLogPhoneCall": true }
        }
      ]
    ]
  }
}
```

The plugin will automatically:
- Inject shorthand `<meta-data>` config into `AndroidManifest.xml`
- Update `MainActivity` to extend `CallxReactActivity` (Android)
- Inject `CallxTriggers`, `CallxFields`, and `CallxApp` into `Info.plist` (iOS)
- Add required background modes and privacy strings (iOS)

### 2. Configure triggers/fields

Configure via plugin options or edit native files as shown in Configuration at a glance.

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

**Native UI not showing?**

- ✅ Check FCM configuration
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