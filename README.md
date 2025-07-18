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

### 📋 Current Limitations

- ❌ **iOS Support**: Not yet supported (PushKit & CallKit integration planned)
- ❌ **Multiple Calls**: Only single call support (queue management coming soon)
- ❌ **Call Logging**: Calls are not logged to phone's call history
- 📧 **Custom Features**: Contact hao.dev7@gmail.com for custom development
- ☕ **Support Development**: [Buy me a coffee](https://www.buymeacoffee.com/bearblock)

---

## ⚡ Quick Setup

### 1. Install

```bash
npm install @bear-block/callx@latest
```

```bash
yarn add @bear-block/callx@latest
```

---

> **⚠️ IMPORTANT:** Ensure you have completed the [React Native Firebase with Messaging setup guide](https://rnfirebase.io/) first.

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

### 3. Expo Setup

If using Expo, add the plugin to your `app.json`:

```json
{
  "expo": {
    "plugins": [["@bear-block/callx", { "mode": "native" }]]
  }
}
```

**Mode Options:**

- `"native"` (default): Adds FCM service for automatic call handling
- `"js"`: No FCM service, handle messages manually in JS code

---

### 4. Create `callx.json`

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
    "requireUnlock": false
  }
}
```

#### Configuration Fields

**Triggers** - Define when to show call UI:

- `incoming.field`: FCM field path to check (e.g., `"type"` or `"data.call.type"`)
- `incoming.value`: Value that triggers incoming call (e.g., `"call.started"`)
- `ended.field/value`: Triggers when call ends
- `missed.field/value`: Triggers when call is missed

**Fields** - Map FCM data to call display:

- `callId.field`: FCM field containing unique call ID
- `callerName.field`: FCM field for caller name
- `callerName.fallback`: Default name if field is empty
- `callerPhone.field`: FCM field for phone number
- `callerPhone.fallback`: Default phone if field is empty
- `callerAvatar.field`: FCM field for avatar URL
- `callerAvatar.fallback`: Default avatar if field is empty

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

> 📝 This config is read at build time by the native module. You must rebuild the app after changing it.

---

### 5. Initialize in JS

Callx should be initialized as early as possible in your app's lifecycle (e.g., `App.tsx`):

```ts
import Callx from '@bear-block/callx';

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
});
```

---

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
});
```

### FCM Token Management

Get FCM token for your server:

```ts
const token = await Callx.getFCMToken();
console.log('FCM Token:', token);
```

### Call Status Management

```ts
// Check if call is active
const isActive = await Callx.isCallActive();

// Get current call data
const currentCall = await Callx.getCurrentCall();

// End current call
await Callx.endCall('call-id');
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
console.log('Active call:', await Callx.getCurrentCall());
console.log('FCM token:', await Callx.getFCMToken());
```

---

## 📖 API Reference

### Methods

| Method                                   | Description                               |
| ---------------------------------------- | ----------------------------------------- |
| `initialize(config)`                     | Initialize Callx with event listeners     |
| `showIncomingCall(data)`                 | Manually display incoming call UI         |
| `handleFcmMessage(data)`                 | Handle FCM message manually (for JS mode) |
| `answerCall(callId)`                     | Answer current call                       |
| `declineCall(callId)`                    | Decline current call                      |
| `endCall(callId)`                        | End current call                          |
| `getFCMToken()`                          | Get FCM token for server                  |
| `isCallActive()`                         | Check if call is currently active         |
| `getCurrentCall()`                       | Get current call data                     |
| `setFieldMapping(field, path, fallback)` | Set FCM field mapping                     |
| `setTrigger(trigger, field, value)`      | Set FCM trigger configuration             |
| `hideFromLockScreen()`                   | Hide app from lock screen                 |
| `moveAppToBackground()`                  | Move app to background                    |

### Event Callbacks

| Event            | Description                            |
| ---------------- | -------------------------------------- |
| `onIncomingCall` | Triggered when incoming call displayed |
| `onCallAnswered` | User answered the call                 |
| `onCallDeclined` | User rejected the call                 |
| `onCallEnded`    | Call ended after it was answered       |
| `onCallMissed`   | Call was missed (no response)          |

---

## 🎯 Best Practices

### 📱 App Architecture

**Recommended Setup:**

```ts
// App.tsx - Initialize early
import Callx from '@bear-block/callx';

// Initialize Callx outside component for earliest possible initialization
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
});

export default function App() {
  // Your app component logic here
  return <YourApp />;
}
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
    // 1. Hide from lock screen
    Callx.hideFromLockScreen();

    // 2. Move to background
    Callx.moveAppToBackground();
  },
});

// Manual end call handling
import { AppState } from 'react-native';

const handleEndCall = async (callId) => {
  try {
    // End call in your app
    await endCallInYourApp(callId);

    // End call in Callx
    await Callx.endCall(callId);

    // Check if app is in background (likely from lock screen)
    const appState = AppState.currentState;
    if (appState === 'background' || appState === 'inactive') {
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
// Then test with real FCM messages
```

### 🚀 Performance Tips

1. **Initialize Early**: Call `Callx.initialize()` in App.tsx
2. **Handle Background**: Use `onCallAnswered` to start your call logic
3. **Clean Up**: Always handle `onCallEnded` and `onCallDeclined`
4. **Error Handling**: Wrap calls in try-catch blocks
5. **Memory Management**: Clear call state when calls end

### 🔒 Security Considerations

1. **Validate FCM Data**: Always validate incoming call data
2. **Rate Limiting**: Implement server-side rate limiting
3. **Token Management**: Rotate FCM tokens regularly
4. **Call Verification**: Verify call authenticity on your server

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
});
```

---

## 📄 License

MIT © [@bear-block](https://github.com/bear-block)
