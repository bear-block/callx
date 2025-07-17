# 📞 Callx

**Beautiful React Native incoming call UI with Firebase Cloud Messaging integration**

[![npm version](https://img.shields.io/npm/v/@bear-block/callx.svg)](https://www.npmjs.com/package/@bear-block/callx)  
[![license](https://img.shields.io/npm/l/@bear-block/callx.svg)](https://www.npmjs.com/package/@bear-block/callx)

---

## 🔧 Features

- 📱 Full-screen native call UI (supports lock screen)
- 🔔 Firebase Cloud Messaging (FCM) integration
- 🧠 Automatic call handling with native service
- 🧪 Built-in call lifecycle events: incoming, answered, declined, ended, missed
- 🛠 Simple integration
- 🔒 Lock screen support with proper Android lifecycle
- 🎨 Beautiful native UI with gradients and animations
- ⚡ High performance with Turbo Modules

---

## ⚡ Quick Setup

### 1. Install

```bash
npm install @bear-block/callx
```

---

### 2. Android Setup

#### Always required

In `MainActivity.kt`, extend `CallxReactActivity`:

```kotlin
import com.callx.CallxReactActivity

class MainActivity : CallxReactActivity() {
  // ...
}
```

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

---

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
    }
  },
  "fields": {
    "callId": {
      "field": "callId",
      "fallback": "unknown-call"
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
    }
  },
  "notification": {
    "channelId": "callx_incoming_calls_v2",
    "channelName": "Incoming Calls v2",
    "channelDescription": "Incoming call notifications with ringtone",
    "importance": "high",
    "sound": "default"
  },
  "app": {
    "packageName": "com.bearblock.callx",
    "mainActivity": "MainActivity",
    "showOverLockscreen": true,
    "requireUnlock": false
  }
}
```

> 📝 This config is read at build time by the native module. You must rebuild the app after changing it.

---

### 4. Initialize in JS

Callx should be initialized as early as possible in your app's lifecycle (e.g., `App.tsx`):

```ts
import Callx from "@bear-block/callx"

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
  }
})
```





---





---

## 🚀 Advanced Usage

### Manual Call Display

You can manually trigger call UI from your JS code:

```ts
import Callx from "@bear-block/callx"

// Show incoming call manually
Callx.showIncomingCall({
  callId: "manual-call-123",
  callerName: "John Doe",
  callerPhone: "+1234567890",
  callerAvatar: "https://example.com/avatar.jpg"
})
```

### FCM Token Management

Get FCM token for your server:

```ts
const token = await Callx.getFCMToken()
console.log("FCM Token:", token)
```

### Call Status Management

```ts
// Check if call is active
const isActive = await Callx.isCallActive()

// Get current call data
const currentCall = await Callx.getCurrentCall()

// End current call
await Callx.endCall("call-id")
```

### Manual FCM Handling

If you're using JS mode, handle FCM messages manually:

```ts
import messaging from "@react-native-firebase/messaging"

messaging().onMessage(async (remoteMessage) => {
  // Handle FCM message manually
  await Callx.handleFcmMessage(remoteMessage.data)
})
```

---

## 🔧 Troubleshooting

### Common Issues

**FCM not working?**
- ✅ Check `google-services.json` is in `android/app/`
- ✅ Verify Firebase project settings
- ✅ Test with real device (not simulator)

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

### Debug Mode

```ts
// Check current state
console.log('Active call:', await Callx.getCurrentCall())
console.log('FCM token:', await Callx.getFCMToken())
```

---

## 📖 API Reference

### Methods

| Method | Description |
|--------|-------------|
| `initialize(config)` | Initialize Callx with event listeners |
| `showIncomingCall(data)` | Manually display incoming call UI |
| `handleFcmMessage(data)` | Handle FCM message manually (for JS mode) |
| `answerCall(callId)` | Answer current call |
| `declineCall(callId)` | Decline current call |
| `endCall(callId)` | End current call |
| `getFCMToken()` | Get FCM token for server |
| `isCallActive()` | Check if call is currently active |
| `getCurrentCall()` | Get current call data |
| `setFieldMapping(field, path, fallback)` | Set FCM field mapping |
| `setTrigger(trigger, field, value)` | Set FCM trigger configuration |
| `hideFromLockScreen()` | Hide app from lock screen |
| `moveAppToBackground()` | Move app to background |

### Event Callbacks

| Event | Description |
|-------|-------------|
| `onIncomingCall` | Triggered when incoming call displayed |
| `onCallAnswered` | User answered the call |
| `onCallDeclined` | User rejected the call |
| `onCallEnded` | Call ended after it was answered |
| `onCallMissed` | Call was missed (no response) |

---

## ☕ Donate

If this library helps you, consider buying me a coffee to support development ☕  
[Buy me a coffee](https://www.buymeacoffee.com/your-name)

---

## 📄 License

MIT © [@bear-block](https://github.com/bear-block)
