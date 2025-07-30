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

## 🔧 Features

- 📱 Full-screen native call UI (supports lock screen)
- 🍎 **NEW**: Complete iOS support with CallKit & PushKit
- 🔔 Firebase Cloud Messaging (FCM) & iOS VoIP push integration
- 🧠 Automatic call handling with native service
- 🧪 Built-in call lifecycle events: incoming, answered, declined, ended, missed
- 🎥 **NEW**: Video call support for both platforms
- 📞 **NEW**: Call end scenarios (answered elsewhere, timeout, cancelled, busy, rejected)
- 📋 **NEW**: Call logging to phone's native call history
- 🛠 Simple integration
- 🔒 Lock screen support with proper Android lifecycle
- 🎨 Beautiful native UI with gradients and animations
- ⚡ High performance with Turbo Modules
- 🚀 **NEW**: Expo plugin for automatic configuration

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

Add to `android/app/src/main/AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.VIBRATE" />
<uses-permission android:name="android.permission.WAKE_LOCK" />
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
- **NEW**: `answered_elsewhere`, `declined`, `timeout`, `cancelled`, `busy`, `rejected` triggers

**Fields** - Map FCM data to call display:

- `callId.field`: FCM field containing unique call ID
- `callerName.field`: FCM field for caller name
- `callerName.fallback`: Default name if field is empty
- `callerPhone.field`: FCM field for phone number
- `callerPhone.fallback`: Default phone if field is empty
- `callerAvatar.field`: FCM field for avatar URL
- `callerAvatar.fallback`: Default avatar if field is empty
- **NEW**: `hasVideo.field`: FCM field for video call flag
- **NEW**: `endReason.field`: FCM field for call end reason
- **NEW**: `answeredBy.field`: FCM field for who answered
- **NEW**: `deviceType.field`: FCM field for device type
- **NEW**: `duration.field`: FCM field for call duration

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
- **NEW**: `supportsVideo`: `true` to enable video call support

**Call Logging** - **NEW**: Native call history logging:

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
  // NEW: Call end scenario events
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
  // NEW: iOS VoIP token updates
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

**NEW**: Callx now supports both voice and video calls:

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

**NEW**: Callx supports comprehensive call end scenarios for better user experience:

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

**NEW**: For iOS, you need to send VoIP push notifications using the VoIP token:

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
  hasVideo: true, // NEW: Video call support
});
```

### Token Management

Get tokens for your server:

```ts
// FCM Token (Android)
const fcmToken = await Callx.getFCMToken();
console.log('FCM Token:', fcmToken);

// VoIP Token (iOS) - NEW
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

## 🔧 Troubleshooting

### Common Issues

**FCM not working?**

- ✅ Check `google-services.json` is in `android/app/`
- ✅ Verify Firebase project settings
- ✅ Test with real device (not simulator)
- ✅ Ensure React Native Firebase is properly installed
- ✅ Check Firebase dependencies are added to Gradle files

**iOS VoIP not working?** **NEW**

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
console.log('VoIP token:', await Callx.getVoIPToken()); // NEW
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
| `getFCMToken()`                          | Get FCM token for server                  | Android |
| `getVoIPToken()` **NEW**                 | Get VoIP token for server                 | iOS |
| `isCallActive()`                         | Check if call is currently active         | Both |
| `getCurrentCall()`                       | Get current call data                     | Both |
| `setFieldMapping(field, path, fallback)` | Set FCM field mapping                     | Both |
| `setTrigger(trigger, field, value)`      | Set FCM trigger configuration             | Both |
| `hideFromLockScreen()`                   | Hide app from lock screen                 | Android |
| `moveAppToBackground()`                  | Move app to background                    | Android |

### Event Callbacks

| Event                       | Description                            |
| --------------------------- | -------------------------------------- |
| `onIncomingCall`           | Triggered when incoming call displayed |
| `onCallAnswered`           | User answered the call                 |
| `onCallDeclined`           | User rejected the call                 |
| `onCallEnded`              | Call ended after it was answered       |
| `onCallMissed`             | Call was missed (no response)          |
| `onCallAnsweredElsewhere` **NEW** | Call answered on another device  |
| `onCallTimeout` **NEW**    | Call timed out                         |
| `onCallCancelled` **NEW**  | Call was cancelled by caller          |
| `onCallBusy` **NEW**       | User is busy (on another call)        |
| `onCallRejected` **NEW**   | Call was rejected                      |
| `onVoIPTokenUpdated` **NEW** | VoIP token updated (iOS)             |

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
  // NEW: Handle call end scenarios
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

**E2E Testing:**

```ts
// Use the built-in server for testing
// example/callx-server/ - Start with: yarn server
// Then test with real FCM messages and VoIP pushes
```

### 🚀 Performance Tips

1. **Initialize Early**: Call `Callx.initialize()` in index.js
2. **Handle Background**: Use `onCallAnswered` to start your call logic
3. **Clean Up**: Always handle `onCallEnded` and `onCallDeclined`
4. **Error Handling**: Wrap calls in try-catch blocks
5. **Memory Management**: Clear call state when calls end
6. **Platform-Specific**: Use `Platform.OS` for platform-specific code

### 🔒 Security Considerations

1. **Validate FCM Data**: Always validate incoming call data
2. **Rate Limiting**: Implement server-side rate limiting
3. **Token Management**: Rotate FCM/VoIP tokens regularly
4. **Call Verification**: Verify call authenticity on your server
5. **VoIP Security**: Use proper VoIP certificates for iOS

### 📊 Monitoring

**Add logging for debugging:**

```ts
Callx.initialize({
  onIncomingCall: (data) => {
    console.log('📞 Incoming call:', data);
    analytics.track('call_received', data);
  },
  onCallAnswered: (data) => {
    console.log('✅ Call answered:', data);
    analytics.track('call_answered', data);
  },
  onVoIPTokenUpdated: (tokenData) => {
    console.log('🍎 VoIP token updated:', tokenData.token);
    // Send to your server
  },
});
```

---

## 🚀 Support Development

If this library helps you build amazing React Native apps, please consider supporting its development:

<div align="center">

[![GitHub stars](https://img.shields.io/github/stars/bear-block/callx.svg?style=social&label=Star)](https://github.com/bear-block/callx)
[![GitHub Sponsors](https://img.shields.io/badge/Sponsor-%E2%9D%A4-red.svg)](https://github.com/sponsors/bear-block)
[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-%E2%98%95-yellow.svg)](https://www.buymeacoffee.com/bearblock)

</div>

---

## 📄 License

MIT © [@bear-block](https://github.com/bear-block)
