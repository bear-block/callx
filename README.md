<div align="center">

# 📞 Callx

**Beautiful React Native incoming call UI with Firebase Cloud Messaging integration**

[![npm version](https://img.shields.io/npm/v/@bear-block/callx.svg)](https://www.npmjs.com/package/@bear-block/callx)
[![license](https://img.shields.io/npm/l/@bear-block/callx.svg)](https://github.com/bear-block/callx/blob/main/LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/bear-block/callx/pulls)
[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-support%20me-yellow?logo=buy-me-a-coffee&style=flat-square)](https://buymeacoffee.com/bearblock)

## ⚡ Quick Setup

**Prerequisites:** Make sure you have `@react-native-firebase/app` and `@react-native-firebase/messaging` properly set up in your project before proceeding.

### React Native CLI (Android)

1. **Install dependencies:**
   ```sh
   yarn add @bear-block/callx
   ```
2. **Add Firebase config:**
   - Download `google-services.json` from Firebase Console
   - Place in `android/app/google-services.json`
3. **Add FCM Service to AndroidManifest.xml:**
   - Open `android/app/src/main/AndroidManifest.xml`
   - Add inside `<application>`:
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
4. **REQUIRED: Extend CallxReactActivity for automatic lockscreen handling:**
   - Open `android/app/src/main/java/com/yourapp/MainActivity.kt`
   - Change from `ReactActivity` to `CallxReactActivity`:

     ```kotlin
     import com.callx.CallxReactActivity

     class MainActivity : CallxReactActivity() {
       // ... rest of your code
     }
     ```

     > **Note:** This is **REQUIRED** for Callx to work properly. The library will throw an error if MainActivity doesn't extend CallxReactActivity.

5. **(Optional) Custom FCM mapping:**
   - Create `callx.json` in your project root for custom mapping.
6. **iOS:**
   - Download `GoogleService-Info.plist` and place in `ios/YourApp/` _(iOS support coming soon)_
   - Run `cd ios && pod install` _(iOS support coming soon)_
7. **JS/TS Usage:**
   ```js
   import CallxInstance from '@bear-block/callx';
   await CallxInstance.initialize({
     onIncomingCall: (callData) => {
       /* ... */
     },
     onCallEnded: (callData) => {
       /* ... */
     },
   });
   ```

---

### Expo (Android)

1. **Install dependencies:**
   ```sh
   npx expo install @bear-block/callx
   ```
2. **Add Callx plugin to app.json:**
   ```json
   {
     "expo": {
       "plugins": ["@bear-block/callx"]
     }
   }
   ```
3. **Add Firebase config:**
   - Download `google-services.json` from Firebase Console
   - Place in `android/app/google-services.json`
4. **(Optional) Custom FCM mapping:**
   - Create `callx.json` in your project root for custom mapping.
5. **Prebuild native code:**
   ```sh
   npx expo prebuild
   ```
   > **Note:** The Expo plugin automatically:
   >
   > - Copies `callx.json` to Android assets
   > - Adds FCM service to AndroidManifest.xml
   > - Adds Firebase dependencies to Gradle files
   > - **REQUIRED:** Modifies MainActivity to extend `CallxReactActivity` for automatic lockscreen handling
6. **JS/TS Usage:**
   ```js
   import CallxInstance from '@bear-block/callx';
   await CallxInstance.initialize({
     onIncomingCall: (callData) => {
       /* ... */
     },
     onCallEnded: (callData) => {
       /* ... */
     },
   });
   ```

---

## ✨ Features

<div align="center">

| 🎨 **Beautiful UI**                                  | 🔥 **Firebase Integration**             | 📱 **Lock Screen Support**               | ⚡ **Zero Config**                   |
| ---------------------------------------------------- | --------------------------------------- | ---------------------------------------- | ------------------------------------ |
| Native Android call UI with gradients and animations | Seamless FCM push notification handling | Full-screen notifications on lock screen | Works out of the box with Expo & CLI |

| 🛠️ **Native UI**                 | 🔧 **Customizable**                        | 📊 **Production Ready**                  | 🚀 **High Performance**                |
| -------------------------------- | ------------------------------------------ | ---------------------------------------- | -------------------------------------- |
| Beautiful native Android call UI | Flexible FCM data mapping via `callx.json` | Comprehensive error handling & debugging | Optimized for real-time call scenarios |

</div>

---

## 🎯 How It Works

<div align="center">

```mermaid
graph LR
    A[FCM Message] --> B[Callx Native Module]
    B --> C[Parse callx.json]
    C --> D[Show Native UI]
    D --> E[User Action]
    E --> F[Emit JS Events]
    F --> G[Your Business Logic]
```

**Native Mode Flow:**

1. **FCM message received** → Native code parses & shows full-screen call UI
2. **User answers/declines** → Native code emits JS events
3. **You handle business logic** → Start VoIP, log, analytics, etc.
4. **No need to build your own UI or notification logic!**

</div>

For automatic initialization, extend `CallxApplication`:

## 📋 Configuration

### Handling Modes

| Mode                 | UI/Notification      | Who Handles UI? | Use Case          |
| -------------------- | -------------------- | --------------- | ----------------- |
| **Native** (default) | Native (recommended) | Callx           | 99% of apps       |
| **Custom**           | None                 | You             | Full custom UI    |
| **Hybrid**           | Native + custom      | Both            | Overlay, advanced |

### callx.json Configuration

`callx.json` is the main configuration file for Callx. It defines how FCM messages are mapped to call events and how the call UI behaves.

#### **File Location & Priority**

Callx uses a **priority-based configuration system** (OVERRIDE, not merge):

```
1. JS Config (initialize() method) - HIGHEST PRIORITY ⭐
2. App's callx.json (in assets) - MEDIUM PRIORITY 📱
3. Library's default callx.json - LOWEST PRIORITY 📚
```

**Important:** Configurations are **OVERRIDDEN**, not merged. Higher priority configs completely replace lower priority ones.

#### **Complete Configuration Structure**

```json
{
  "triggers": {
    "incoming": {
      "field": "type",
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
    "packageName": "com.yourapp",
    "mainActivity": "MainActivity",
    "showOverLockscreen": true,
    "requireUnlock": false
  }
}
```

**Note:** Callx supports **nested field paths** for complex FCM structures. You can use dot notation like `data.type`, `custom.event`, `payload.call.id`, etc.

#### **Configuration Sections**

<details>
<summary><strong>🎯 Triggers</strong></summary>

Define when Callx should show the call UI based on FCM message content:

```json
"triggers": {
  "incoming": {
    "field": "type",          // FCM field to check (supports nested paths)
    "value": "call.started"   // Value that triggers incoming call
  },
  "ended": {
    "field": "type",
    "value": "call.ended"     // Value that triggers call end
  },
  "missed": {
    "field": "type",
    "value": "call.missed"    // Value that triggers missed call
  }
}
```

**Supported nested paths:** `type`, `data.type`, `custom.event`, `payload.call.type`, etc.

**Supported trigger types:**

- `incoming` - Shows full-screen call UI
- `ended` - Dismisses call UI and sends event
- `missed` - Sends missed call event (no UI)

</details>

<details>
<summary><strong>📊 Fields</strong></summary>

Map FCM data fields to call information displayed in the UI:

```json
"fields": {
  "callId": {
    "field": "callId",                // FCM field path (supports nested paths)
    "fallback": "unknown-call"        // Default if field missing
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
}
```

**Supported nested paths:** `callId`, `data.callId`, `call.id`, `payload.call.id`, etc.

**Required fields:**

- `callId` - Unique identifier for the call
- `callerName` - Name displayed in call UI
- `callerPhone` - Phone number displayed in call UI

**Optional fields:**

- `callerAvatar` - Avatar image URL (falls back to initials)

</details>

<details>
<summary><strong>🔔 Notification</strong></summary>

Configure notification channel for incoming calls:

```json
"notification": {
  "channelId": "callx_incoming_calls_v2",
  "channelName": "Incoming Calls v2",
  "channelDescription": "Incoming call notifications with ringtone",
  "importance": "high",        // "high" | "default" | "low"
  "sound": "default"           // "default" | "none" | custom sound
}
```

**Importance levels:**

- `high` - Shows over lock screen (recommended)
- `default` - Normal notification behavior
- `low` - Minimal notification

</details>

<details>
<summary><strong>📱 App</strong></summary>

Configure app-specific settings for lockscreen behavior:

```json
"app": {
  "packageName": "com.yourapp",     // Your app's package name
  "mainActivity": "MainActivity",    // Your MainActivity class name
  "showOverLockscreen": true,       // Show over lock screen
  "requireUnlock": false            // Require unlock before interaction
}
```

**Settings:**

- `packageName` - Used to launch your app when call is answered
- `mainActivity` - Class name of your MainActivity (usually "MainActivity")
- `showOverLockscreen` - Whether to show over lock screen
- `requireUnlock` - Whether to require unlock before user can interact

</details>

#### **Configuration Priority Examples**

<details>
<summary><strong>Example 1: App's callx.json overrides library default</strong></summary>

**Library default:**

```json
{
  "triggers": {
    "incoming": { "field": "type", "value": "call.started" }
  }
}
```

**App's callx.json:**

```json
{
  "triggers": {
    "incoming": { "field": "data.type", "value": "incoming_call" }
  }
}
```

**Result:** App's config is used (OVERRIDE)

</details>

<details>
<summary><strong>Example 2: JS config overrides callx.json</strong></summary>

**App's callx.json:**

```json
{
  "triggers": {
    "incoming": { "field": "type", "value": "incoming_call" }
  }
}
```

**JS initialize():**

```js
await CallxInstance.initialize({
  triggers: {
    incoming: { field: 'type', value: 'call.started' },
  },
});
```

**Result:** JS config is used (OVERRIDE), callx.json is ignored

</details>

#### **FCM Message Examples**

<details>
<summary><strong>Standard FCM Structure</strong></summary>

```json
{
  "type": "call.started",
  "callId": "call-123",
  "callerName": "John Doe",
  "callerPhone": "+1234567890",
  "callerAvatar": "https://example.com/avatar.jpg"
}
```

**Mapped to:**

```json
{
  "callId": "call-123",
  "callerName": "John Doe",
  "callerPhone": "+1234567890",
  "callerAvatar": "https://example.com/avatar.jpg"
}
```

</details>

<details>
<summary><strong>Custom FCM Structure</strong></summary>

```json
{
  "custom": {
    "event": "incoming_call",
    "call": {
      "id": "call-456",
      "from": "Jane Smith",
      "number": "+0987654321"
    }
  }
}
```

**With callx.json:**

```json
{
  "triggers": {
    "incoming": { "field": "custom.event", "value": "incoming_call" }
  },
  "fields": {
    "callId": { "field": "custom.call.id", "fallback": "unknown" },
    "callerName": { "field": "custom.call.from", "fallback": "Unknown" },
    "callerPhone": { "field": "custom.call.number", "fallback": "No Number" }
  }
}
```

**This demonstrates nested field support:** `custom.event`, `custom.call.id`, etc.

</details>

#### **Best Practices**

✅ **Do:**

- Use descriptive field names in your FCM messages
- Provide meaningful fallback values
- Test with different FCM message structures
- Use dot notation for nested fields (e.g., `data.type`, `custom.event`)
- Keep configuration simple and readable

❌ **Don't:**

- Use deeply nested FCM structures (harder to map)
- Rely on optional fields without fallbacks
- Mix different FCM structures in the same app
- Use generic field names like "id" or "name"

#### **Troubleshooting**

<details>
<summary><strong>Common Issues</strong></summary>

**Problem:** Call UI doesn't show

- **Check:** FCM message structure matches callx.json triggers
- **Check:** Field paths are correct (use `type` for root level, `data.type` for nested)

**Problem:** Wrong data displayed

- **Check:** Field mappings in callx.json
- **Check:** Fallback values are appropriate

**Problem:** App doesn't launch when answering

- **Check:** `packageName` and `mainActivity` in app section
- **Check:** MainActivity extends CallxReactActivity

**Problem:** Lockscreen behavior unexpected

- **Check:** `showOverLockscreen` and `requireUnlock` settings
- **Check:** Notification importance is set to "high"
</details>

---

## 📚 API Reference

### Core Methods

| Method                       | Description                             | Returns            |
| ---------------------------- | --------------------------------------- | ------------------ |
| `initialize(config)`         | Initialize Callx with configuration     | `Promise<void>`    |
| `handleFcmMessage(data)`     | Process FCM message and trigger call UI | `Promise<void>`    |
| `showIncomingCall(callData)` | Manually show incoming call screen      | `Promise<void>`    |
| `getFCMToken()`              | Get current FCM token for server        | `Promise<string>`  |
| `isCallActive()`             | Check if there's an active call         | `boolean`          |
| `getCurrentCall()`           | Get current call data                   | `CallData \| null` |

### Configuration

```js
await CallxInstance.initialize({
  // Handling mode
  handling: {
    mode: 'native', // 'native' | 'custom' | 'hybrid'
    enableCustomUI: false,
  },

  // Event handlers
  onIncomingCall: (callData) => {
    /* Called when incoming call detected */
  },
  onCallAnswered: (callData) => {
    /* Called when user answers */
  },
  onCallDeclined: (callData) => {
    /* Called when user declines */
  },
  onCallEnded: (callData) => {
    /* Called when call ends */
  },
  onError: (error) => {
    /* Called when error occurs */
  },

  // Debug options
  debug: {
    enabled: __DEV__,
    verbose: false,
  },
});
```

### CallData Interface

```typescript
interface CallData {
  callId: string;
  callerName: string;
  callerPhone: string;
  callerAvatar?: string;
  timestamp: number;
  metadata?: Record<string, any>;
}
```

---

## 🔧 Setup Comparison

### Manual vs Automatic Setup

| Setup Type                   | React Native CLI                                 | Expo                                |
| ---------------------------- | ------------------------------------------------ | ----------------------------------- |
| **FCM Service**              | Manual (AndroidManifest.xml)                     | ✅ Automatic (Plugin)               |
| **Firebase Dependencies**    | Manual (Gradle files)                            | ✅ Automatic (Plugin)               |
| **callx.json Copy**          | Manual or react-native.config.js                 | ✅ Automatic (Plugin)               |
| **MainActivity Inheritance** | **REQUIRED:** Manual (extend CallxReactActivity) | ✅ **REQUIRED:** Automatic (Plugin) |

### Why Extend CallxReactActivity?

Extending `CallxReactActivity` provides:

- ✅ **Automatic lockscreen handling** - App shows over lock screen
- ✅ **Reliable intent processing** - Handles call answer intents properly
- ✅ **Better timing** - Reduces delays in showing call UI
- ✅ **Production stability** - More reliable on different devices

**Without extending CallxReactActivity:**

- ❌ **Library will throw an error** - Callx requires MainActivity to extend CallxReactActivity
- ❌ **App will crash on initialization** - Verification happens during module initialization
- ❌ **No lockscreen support** - Cannot handle lockscreen notifications properly

---

## 🚀 Best Practices

### Production Setup

<details>
<summary><strong>🔐 Error Handling</strong></summary>

```js
await CallxInstance.initialize({
  onIncomingCall: (callData) => {
    try {
      startVoIPCall(callData);
    } catch (error) {
      console.error('Call handling error:', error);
      // Fallback to native UI
      CallxInstance.showIncomingCall(callData);
    }
  },
  onError: (error) => {
    console.error('Callx error:', error);
    reportError(error); // Send to your error tracking service
  },
});
```

</details>

<details>
<summary><strong>⚡ Performance Optimization</strong></summary>

```js
// Initialize once in App.js, not in components
let isInitialized = false;

const initializeCallx = async () => {
  if (isInitialized) return;

  await CallxInstance.initialize({
    // ... config
  });

  isInitialized = true;
};
```

</details>

<details>
<summary><strong>🔒 Security</strong></summary>

```js
// Validate FCM data before processing
const validateCallData = (data) => {
  const required = ['callId', 'callerName', 'callerPhone'];
  return required.every((field) => data[field]);
};

messaging().onMessage(async (remoteMessage) => {
  if (validateCallData(remoteMessage.data)) {
    await CallxInstance.handleFcmMessage(remoteMessage.data);
  }
});
```

</details>

<details>
<summary><strong>🧪 Testing</strong></summary>

```js
// Development testing
if (__DEV__) {
  CallxInstance.setDebugMode(true);
}

// Test with mock data
const mockCallData = {
  callId: 'test-call-123',
  callerName: 'Test User',
  callerPhone: '+1234567890',
  callerAvatar: 'https://example.com/avatar.jpg',
};

CallxInstance.showIncomingCall(mockCallData);
```

</details>

---

## 🧩 Examples

### Native Mode (Recommended)

```js
await CallxInstance.initialize({
  onIncomingCall: (callData) => {
    // Start your VoIP service
    startVoIPCall(callData);

    // Track analytics
    analytics.track('call_received', { callId: callData.callId });
  },
  onCallAnswered: (callData) => {
    // Handle answered call
    analytics.track('call_answered', { callId: callData.callId });
  },
  onCallEnded: (callData) => {
    // Clean up resources
    endVoIPCall(callData.callId);
  },
});
```

### Show Incoming Call

```js
await CallxInstance.initialize({
  onIncomingCall: (callData) => {
    // Handle incoming call event
    console.log('Incoming call:', callData);
  },
  onCallEnded: (callData) => {
    // Handle call ended event
    console.log('Call ended:', callData);
  },
});
```

### Handle FCM Messages

```js
await CallxInstance.initialize({
  onIncomingCall: (callData) => {
    // Handle incoming call from FCM
    console.log('FCM incoming call:', callData);
  },
  onCallEnded: (callData) => {
    // Handle call ended from FCM
    console.log('FCM call ended:', callData);
  },
});
```

### Get FCM Token

## 🔧 System Requirements

- **Android**: API 21+ (Android 5.0+)
- **iOS**: iOS 12.0+ (coming soon)
- **React Native**: 0.70+
- **Expo**: SDK 48+
- **Dependencies**: `@react-native-firebase/messaging`, `@react-native-firebase/app`

### Lock Screen Modes

## ❓ Troubleshooting

<details>
<summary><strong>🔧 Common Issues</strong></summary>

**FCM not working?**

- ✅ Check `google-services.json` is in `android/app/`
- ✅ Verify Firebase project settings
- ✅ Test with real device (not simulator)

**callx.json not loaded?**

- ✅ Place in project root (not in android folder)
- ✅ Verify file format is valid JSON

**Expo build fails?**

- ✅ Run `npx expo prebuild --clean`
- ✅ Check plugin configuration in `app.json`

**Native UI not showing?**

- ✅ Check FCM configuration
- ✅ Verify `callx.json` is properly loaded

</details>

<details>
<summary><strong>🐛 Debug Mode</strong></summary>

```js
// Enable comprehensive debugging
CallxInstance.setDebugMode(true);

// Check current state
console.log('Active call:', CallxInstance.getCurrentCall());
console.log('FCM token:', await CallxInstance.getFCMToken());

// Test call flow
CallxInstance.showIncomingCall({
  callId: 'debug-call',
  callerName: 'Debug User',
  callerPhone: '+1234567890',
});
```

</details>

---

## 🤝 Migration Guide

### From Custom Call UI

1. **Remove custom notification logic**
2. **Replace with Callx initialization**
3. **Update FCM handling**

```js
// Before
messaging().onMessage((message) => {
  // Custom notification logic
});

// After
messaging().onMessage(async (message) => {
  await CallxInstance.handleFcmMessage(message.data);
});
```

### From Other Libraries

- **react-native-callkeep**: Callx provides better Android lock screen support
- **react-native-voip-push-notification**: Callx is more focused on UI and FCM integration
- **Custom solutions**: Callx reduces boilerplate and provides consistent UX

---

## 📖 Resources

- [🤝 Contributing](./CONTRIBUTING.md) - How to contribute
- [🐛 Issues](https://github.com/bear-block/callx/issues) - Report bugs or request features

---

<div align="center">

**Made with ❤️ by [bear-block](https://github.com/bear-block)**

[![GitHub stars](https://img.shields.io/github/stars/bear-block/callx?style=social)](https://github.com/bear-block/callx)
[![GitHub forks](https://img.shields.io/github/forks/bear-block/callx?style=social)](https://github.com/bear-block/callx)

</div>

---
