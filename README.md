# Callx

**React Native incoming call UI & FCM integration for Android**

[![npm version](https://img.shields.io/npm/v/callx.svg)](https://www.npmjs.com/package/callx)
[![license](https://img.shields.io/npm/l/callx.svg)](https://github.com/bear-block/callx/blob/main/LICENSE)

[☕ Buy me a coffee](https://coff.ee/bearblock) - Support the development of Callx!

---

## 🚀 Quick Start

### React Native CLI

1. `npm install callx` or `yarn add callx`
2. Add `google-services.json` to `android/app/` (from Firebase Console)
3. In `android/app/build.gradle` add:
   ```gradle
   apply plugin: 'com.google.gms.google-services'
   ```
   In `android/build.gradle` add:
   ```gradle
   buildscript {
     dependencies {
       classpath 'com.google.gms:google-services:4.4.0'
     }
   }
   ```
4. Use in your app (see [Usage](#usage))

### Expo

1. `npx expo install callx`
2. Add plugin to `app.json`:
   ```json
   { "expo": { "plugins": ["callx"] } }
   ```
3. Add `google-services.json` to `android/app/` (after `npx expo prebuild`)
4. Use in your app (see [Usage](#usage))

---

## 🛠️ How It Works (Native Mode)

- FCM message received → Native code parses & shows full-screen call UI
- User answers/declines → Native code emits JS events
- You handle business logic in JS (start VoIP, log, etc.)
- **No need to build your own UI or notification logic!**

---

## ⚙️ Customizing FCM Mapping with `callx.json`

- **Optional:** Only needed if your FCM data structure is different from default.
- Place `callx.json` in `android/app/src/main/assets/`.

**Example:**

```json
{
  "triggers": {
    "incoming": { "field": "type", "value": "call.started" },
    "ended": { "field": "type", "value": "call.ended" },
    "missed": { "field": "type", "value": "call.missed" }
  },
  "fields": {
    "callId": { "field": "callId", "fallback": "unknown-call" },
    "callerName": { "field": "callerName", "fallback": "Unknown Caller" },
    "callerPhone": { "field": "callerPhone", "fallback": "No Number" },
    "callerAvatar": { "field": "callerAvatar", "fallback": null }
  },
  "notification": {
    "channelId": "callx_incoming_calls",
    "channelName": "Incoming Calls",
    "channelDescription": "Notifications for incoming calls",
    "importance": "high",
    "sound": "default"
  }
}
```

- See [README_BUILD_CONFIG.md](./README_BUILD_CONFIG.md) for advanced usage.

---

## 🔄 Handling Modes

| Mode   | UI/Notification  | Who handles UI? | Use case              |
| ------ | ---------------- | --------------- | --------------------- |
| native | Native (default) | Callx           | 99% apps, recommended |
| custom | None             | You             | Full custom UI        |
| hybrid | Native + custom  | Both            | Overlay, advanced     |

**Recommended:** Use `native` mode unless you have a strong reason.

**Config example:**

```js
await CallxInstance.initialize({
  handling: { mode: 'native' }, // or 'custom', 'hybrid'
  onIncomingCall: (callData) => {
    /* ... */
  },
  onCallEnded: (callData) => {
    /* ... */
  },
  // ...
});
```

---

## 📚 API Reference (Core)

| Method                       | Description               |
| ---------------------------- | ------------------------- |
| `initialize(config)`         | Initialize Callx          |
| `showIncomingCall(callData)` | Show incoming call screen |
| `handleFcmMessage(data)`     | Handle FCM message        |
| `getFCMToken()`              | Get current FCM token     |
| `endCall(callId)`            | End current call          |
| `answerCall(callId)`         | Answer incoming call      |
| `declineCall(callId)`        | Decline incoming call     |
| `isCallActive()`             | Check if call is active   |
| `getCurrentCall()`           | Get current call data     |
| `hideFromLockScreen()`       | Hide app from lock screen |
| `moveAppToBackground()`      | Move app to background    |

---

## 🧑‍💻 Usage (Native Mode)

```js
import { CallxInstance } from 'callx';

await CallxInstance.initialize({
  onIncomingCall: (callData) => {
    // Start your VoIP logic, show alert, etc.
    console.log('Incoming call:', callData);
  },
  onCallEnded: (callData) => {
    // Clean up, log, etc.
  },
});

// FCM message handler
import messaging from '@react-native-firebase/messaging';
messaging().onMessage(async (remoteMessage) => {
  await CallxInstance.handleFcmMessage(remoteMessage.data);
});
```

---

## 🧩 Examples

### Native Mode (Recommended)

```js
await CallxInstance.initialize({
  onIncomingCall: (callData) => {
    /* ... */
  },
  onCallEnded: (callData) => {
    /* ... */
  },
});
```

### Custom Mode

```js
await CallxInstance.initialize({
  handling: { mode: 'custom', enableCustomUI: true },
  onIncomingCall: (callData) => {
    showCustomUI(callData);
  },
  onCallEnded: (callData) => {
    hideCustomUI();
  },
});
```

### Hybrid Mode

```js
await CallxInstance.initialize({
  handling: { mode: 'hybrid', enableCustomUI: true },
  onIncomingCall: (callData) => {
    showOverlay(callData);
  },
  onCallEnded: (callData) => {
    hideOverlay();
  },
});
```

---

## ❓ Troubleshooting & FAQ

- **FCM not working?** Check `google-services.json` and Firebase setup.
- **callx.json not loaded?** Make sure it's in `android/app/src/main/assets/`.
- **Expo build fails?** Run `npx expo prebuild` and check plugin config.
- **Custom mode UI not showing?** You must implement all UI and notification logic yourself.
- **How to debug?** Use `CallxInstance.setDebugMode(true)` for verbose logs.

---

## 📖 More

- [Lock Screen Management](./LOCKSCREEN_MANAGEMENT.md)
- [API Reference](./LOCKSCREEN_API_REFERENCE.md)
- [Contributing](./CONTRIBUTING.md)
- [Issues](https://github.com/bear-block/callx/issues)

---

MIT License — Made with ❤️ by [bear-block](https://github.com/bear-block)
