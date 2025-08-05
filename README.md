# 📞 Callx - React Native Incoming Call Library

**Beautiful React Native incoming call UI with Firebase Cloud Messaging integration**

[![npm version](https://img.shields.io/npm/v/@bear-block/callx.svg)](https://www.npmjs.com/package/@bear-block/callx)  
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
- 📞 **Call end scenarios** (answered elsewhere, timeout, cancelled, busy, rejected)
- 📋 **Call logging** to phone's native call history
- 🎛️ **Call Controls**: Mute/Unmute, Speaker Mode, DTMF Keypad
- ⚙️ **Configuration**: JSON-based configuration (`callx.json`)
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
npm install @bear-block/callx@latest
```

```bash
yarn add @bear-block/callx@latest
```

---

## 🚀 React Native CLI Setup

### 1. Android Setup

#### Always required

In `MainActivity.kt`, extend `CallxReactActivity`:

```kotlin
import com.callx.CallxReactActivity

class MainActivity : CallxReactActivity() {
  // ...
}
```

#### FCM Service Setup

**Option 1: Handle from native (recommended)**

Add the following to your `AndroidManifest.xml`:

```xml
<service
  android:name="com.callx.CallxFirebaseMessagingService"
  android:directBootAware="true"
  android:exported="false">
  <intent-filter android:priority="1">
    <action android:name="com.google.firebase.MESSAGING_EVENT" />
  </intent-filter>
</service>
```

**Option 2: Handle from JS**

No need to add service tags. You'll handle FCM messages manually in your JS code.

#### Android Permissions

**Permissions are automatically included in the library.** If you're using the Expo plugin, no manual setup is required.

For manual setup, add to `android/app/src/main/AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.WAKE_LOCK" />
<uses-permission android:name="android.permission.VIBRATE" />
<uses-permission android:name="android.permission.USE_FULL_SCREEN_INTENT" />
<uses-permission android:name="android.permission.SYSTEM_ALERT_WINDOW" />
<uses-permission android:name="android.permission.WRITE_CALL_LOG" />
<uses-permission android:name="android.permission.READ_CALL_LOG" />
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

<key>NSMicrophoneUsageDescription</key>
<string>This app needs microphone access for voice calls</string>
```

### 3. Create `callx.json`

Create a `callx.json` file in the root of your project.

```json
{
  "triggers": {
    "incoming": {
      "field": "type", // can be "data.call.type" for nested JSON paths
      "value": "call.started"
    },
    "ended": {
      "field": "type",
      "value": "call.ended"
    },
    "missed": {
      "field": "type",
      "value": "call.missed"
    },
    "answered_elsewhere": {
      "field": "type",
      "value": "call.answered_elsewhere"
    },
    "declined": {
      "field": "type",
      "value": "call.declined"
    },
    "timeout": {
      "field": "type",
      "value": "call.timeout"
    },
    "cancelled": {
      "field": "type",
      "value": "call.cancelled"
    },
    "busy": {
      "field": "type",
      "value": "call.busy"
    },
    "rejected": {
      "field": "type",
      "value": "call.rejected"
    }
  },
  "fields": {
    "callId": {
      "field": "callId"
    },
    "callerName": {
      "field": "callerName",
      "fallback": "Unknown Caller"
    },
    "callerPhone": {
      "field": "callerPhone",
      "fallback": "No Number"
    },
    "callerAvatar": {
      "field": "callerAvatar",
      "fallback": "https://picsum.photos/200/200"
    },
    "hasVideo": {
      "field": "hasVideo",
      "fallback": false
    },
    "endReason": {
      "field": "endReason",
      "fallback": "unknown"
    },
    "answeredBy": {
      "field": "answeredBy",
      "fallback": ""
    },
    "deviceType": {
      "field": "deviceType",
      "fallback": ""
    },
    "duration": {
      "field": "duration",
      "fallback": "0"
    }
  },
  "notification": {
    "channelId": "callx_incoming_calls",
    "channelName": "Incoming Calls",
    "channelDescription": "Incoming call notifications with ringtone",
    "importance": "high",
    "sound": "default"
  },
  "app": {
    "packageName": "com.your.package.name",
    "mainActivity": "MainActivity",
    "showOverLockscreen": true,
    "requireUnlock": false,
    "supportsVideo": true
  },
  "callLogging": {
    "enabled": true,
    "logAnswered": true,
    "logDeclined": true,
    "logMissed": true,
    "logDuration": true,
    "logCallerInfo": true
  }
}
```

#### Configuration Fields

**Triggers** - Define when to show call UI:

- `incoming.field`: FCM field path to check (e.g., `"type"` or `"data.call.type"`)
- `incoming.value`: Value that triggers incoming call (e.g., `"call.started"`)
- `ended.field/value`: Triggers when call ends
- `missed.field/value`: Triggers when call is missed
- `answered_elsewhere`, `declined`, `timeout`, `cancelled`, `busy`, `rejected` triggers
- `hasVideo.field`: FCM field for video call flag
- `endReason.field`: FCM field for call end reason
- `answeredBy.field`: FCM field for who answered
- `deviceType.field`: FCM field for device type
- `duration.field`: FCM field for call duration

**Notification** - Android notification settings:

- `channelId`: Unique notification channel ID
- `channelName`: Channel name shown in Android settings
- `channelDescription`: Channel description
- `importance`: `"high"` for heads-up notifications
- `sound`: `"default"` for ringtone

**App** - App-specific settings:

- `packageName`: Your app's package name (e.g., `"com.your.package.name"`)
- `mainActivity`: Your MainActivity class name
- `showOverLockscreen`: `true` to show over lock screen
- `requireUnlock`: `false` to allow interaction without unlocking
- `supportsVideo`: `true` to enable video call support

**Call Logging** - Native call history logging:

- `enabled`: Master switch for call logging
- `logAnswered`: Log answered calls
- `logDeclined`: Log declined calls
- `logMissed`: Log missed calls
- `logDuration`: Track call duration
- `logCallerInfo`: Log caller name and info

> 📝 This config is read at build time by the native module. You must rebuild the app after changing it.

### 4. Initialize in JS

Callx should be initialized as early as possible in your app's lifecycle (e.g., `index.js`):

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
    // Called when user rejects the call
  },
  onCallEnded: (data) => {
    // Called when call ends
  },
  onCallMissed: (data) => {
    // Called when call is missed
  },
  // Call end scenario events
  onCallAnsweredElsewhere: (data) => {
    // Called when call is answered on another device
  },
  onCallTimeout: (data) => {
    // Called when call times out
  },
  onCallCancelled: (data) => {
    // Called when call is cancelled by caller
  },
  onCallBusy: (data) => {
    // Called when user is busy
  },
  onCallRejected: (data) => {
    // Called when call is rejected
  },
  // iOS VoIP token updates
  onVoIPTokenUpdated: (tokenData) => {
    // Called when iOS VoIP token updates
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
    "plugins": ["@bear-block/callx"]
  }
}
```

The plugin will automatically:
- Copy `callx.json` to the app bundle
- Add required permissions
- Configure MainActivity (Android)
- Configure Info.plist (iOS)

### 2. Create `callx.json`

Create a `callx.json` file in the root of your project (same configuration as React Native CLI).

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
  endReason?: 'answered_elsewhere' | 'timeout' | 'cancelled' | 'busy' | 'rejected' | 'declined' | 'missed' | 'ended' | 'unknown';
  answeredBy?: string; // Who answered the call
  deviceType?: string; // Device type that answered
  duration?: number;   // Call duration in seconds
  timestamp?: number;
}
```

---

## 📞 Call End Scenarios

Callx supports comprehensive call end scenarios for better user experience:

**Example Scenarios:**

**1. Call Answered Elsewhere:**
```json
{
  "data": {
    "type": "call.answered_elsewhere",
    "callId": "call-123",
    "answeredBy": "John Doe",
    "deviceType": "desktop"
  }
}
```

**2. Call Timeout:**
```json
{
  "data": {
    "type": "call.timeout",
    "callId": "call-123",
    "endReason": "timeout"
  }
}
```

**3. Call Cancelled:**
```json
{
  "data": {
    "type": "call.cancelled",
    "callId": "call-123",
    "endReason": "cancelled"
  }
}
```

---

## 🔥 FCM & iOS VoIP Integration

### Android (FCM)

Callx automatically handles FCM messages for Android. Just send a data-only message:

```json
{
  "data": {
    "type": "call.started",
    "callId": "call-123",
    "callerName": "John Doe",
    "callerPhone": "+1234567890",
    "hasVideo": false
  }
}
```

### iOS (VoIP Push)

For iOS, you need to send VoIP push notifications using the VoIP token:

```typescript
// Get VoIP token
const voipToken = await Callx.getVoIPToken();

// Listen for token updates
Callx.initialize({
  onVoIPTokenUpdated: (tokenData) => {
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

## 🎛️ Call Control Features

Callx now supports advanced call control features:

### **Mute/Unmute**
```ts
// Mute the current call
await Callx.muteCall(callId);

// Unmute the current call  
await Callx.unmuteCall(callId);

// Check if call is muted
const isMuted = await Callx.isMuted(callId);
```

### **Speaker Mode**
```ts
// Enable speaker mode
await Callx.setSpeakerMode(true);

// Disable speaker mode
await Callx.setSpeakerMode(false);

// Check speaker mode status
const isSpeaker = await Callx.isSpeakerMode();
```

### **DTMF Keypad**
```ts
// Send single DTMF tone
await Callx.sendDTMF(callId, '1');

// Send DTMF sequence
await Callx.sendDTMFSequence(callId, '123456');
```

### **Call State & Duration**
```ts
// Get detailed call state
const state = await Callx.getCallState(callId);
// Returns: {
//   callId: string,
//   isMuted: boolean,
//   isSpeakerMode: boolean,
//   isOnHold: boolean,
//   isRecording: boolean,
//   duration: number,
//   audioRoute: 'speaker' | 'earpiece' | 'bluetooth' | 'headset',
//   callQuality: 'excellent' | 'good' | 'fair' | 'poor'
// }

// Get call duration in milliseconds
const duration = await Callx.getCallDuration(callId);
```

### **Event Listeners**
```ts
Callx.initialize({
  // ... existing listeners ...
  
  // Call control events
  onCallMuted: (data) => {
    console.log('Call muted:', data.isMuted);
  },
  onCallUnmuted: (data) => {
    console.log('Call unmuted:', data.isMuted);
  },
  onSpeakerModeChanged: (data) => {
    console.log('Speaker mode:', data.isSpeakerMode);
  },
  onAudioRouteChanged: (data) => {
    console.log('Audio route:', data.audioRoute);
  },
  onCallQualityChanged: (data) => {
    console.log('Call quality:', data.callQuality);
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
| `getCallState(callId)`             | Get detailed call state           | Both |
| `getCallDuration(callId)`          | Get call duration in milliseconds | Both |
| `getConfiguration()`                | Get current configuration for debugging | Both |

### Event Callbacks

| Event                       | Description                            |
| --------------------------- | -------------------------------------- |
| `onIncomingCall`           | Triggered when incoming call displayed |
| `onCallAnswered`           | User answered the call                 |
| `onCallDeclined`           | User rejected the call                 |
| `onCallEnded`              | Call ended after it was answered       |
| `onCallMissed`             | Call was missed (no response)          |
| `onCallAnsweredElsewhere` | Call answered on another device  |
| `onCallTimeout`    | Call timed out                         |
| `onCallCancelled`  | Call was cancelled by caller          |
| `onCallBusy`       | User is busy (on another call)        |
| `onCallRejected`                   | Call was rejected by user         | Both |
| `onCallMuted`                      | Call was muted                   | Both |
| `onCallUnmuted`                    | Call was unmuted                 | Both |
| `onSpeakerModeChanged`             | Speaker mode changed             | Both |
| `onAudioRouteChanged`               | Audio route changed              | Both |
| `onCallQualityChanged`              | Call quality changed             | Both |
| `onFCMTokenUpdated`                | FCM token was updated            | Both |

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
    // Handle call declined
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

### 🧪 Testing Strategy

**Unit Tests:**

```ts
// __tests__/Callx.test.ts
import Callx from '@bear-block/callx';

describe('Callx Integration', () => {
  test('should initialize properly', async () => {
    const mockConfig = {
      onIncomingCall: jest.fn(),
      onCallAnswered: jest.fn(),
    };

    await Callx.initialize(mockConfig);
    expect(mockConfig.onIncomingCall).toBeDefined();
  });
});
```