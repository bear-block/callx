# Callx - React Native Incoming Call Library

A powerful React Native library for handling incoming calls with Firebase Cloud Messaging (FCM), featuring lock screen integration and customizable call UI.

> **⚠️ Current Version Support:** This version only supports **Android** and **React Native CLI**. 
> 
> **🚀 Coming Soon:** Expo and iOS support are in development. 
> 
> **[☕ Buy me a coffee](https://coff.ee/bearblock)** to support the development of Expo and iOS support!

## 🚀 Features

- **📱 Lock Screen Integration** - Show incoming calls over lock screen
- **🔥 Firebase FCM Support** - Handle calls via push notifications
- **🎨 Customizable UI** - Beautiful, modern call interface
- **⚡ Zero Configuration** - Minimal setup required
- **🔒 Security Modes** - Multiple lock screen security levels
- **📞 Background Processing** - Handle calls when app is closed
- **🎯 Auto-detection** - Automatically detects ReactActivity

## 📋 Requirements

- **Platform:** Android only (iOS support coming soon)
- **Framework:** React Native CLI only (Expo support coming soon)
- **React Native:** 0.70+
- **Android:** API level 24+ (Android 7.0+)

## 📦 Installation

```bash
yarn add @bear-block/callx
```

## ⚡ Quick Setup

### 1. Add Firebase Configuration

Add your `google-services.json` file to `android/app/` directory.

### 2. Update Application Class (Optional)

For automatic initialization, extend `CallxApplication`:

```kotlin
// android/app/src/main/java/com/yourapp/MainApplication.kt
package com.yourapp

import com.callx.CallxApplication
import com.facebook.react.ReactApplication

class MainApplication : CallxApplication(), ReactApplication {
  // Your existing ReactApplication implementation
}
```

### 3. Add Configuration (Optional)

Create `android/app/src/main/assets/callx.json`:

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
    }
  },
  "app": {
    "showOverLockscreen": true,
    "requireUnlock": false
  }
}
```

## ✅ That's it!

The library automatically handles:
- ✅ Firebase dependencies
- ✅ Google Services plugin
- ✅ FCM service registration
- ✅ Lock screen handling
- ✅ Configuration loading
- ✅ Auto-detection of ReactActivity

**No need to extend any classes or modify MainActivity!**

## 📱 Usage

### Initialize Callx

```typescript
import CallxInstance from '@bear-block/callx';

// Initialize with event handlers
await CallxInstance.initialize({
  onIncomingCall: (callData) => {
    console.log('Incoming call:', callData);
  },
  onCallAnswered: (callData) => {
    console.log('Call answered:', callData);
  },
  onCallDeclined: (callData) => {
    console.log('Call declined:', callData);
  },
  onCallEnded: (callData) => {
    console.log('Call ended:', callData);
  },
  onCallMissed: (callData) => {
    console.log('Call missed:', callData);
  },
});
```

### Show Incoming Call

```typescript
await CallxInstance.showIncomingCall({
  callId: 'call-123',
  callerName: 'John Doe',
  callerPhone: '+1234567890',
  callerAvatar: 'https://example.com/avatar.jpg',
});
```

### Handle FCM Messages

```typescript
// Handle FCM messages manually (optional)
await CallxInstance.handleFcmMessage({
  type: 'call.started',
  callId: 'call-123',
  callerName: 'John Doe',
  callerPhone: '+1234567890',
});
```

### Get FCM Token

```typescript
const token = await CallxInstance.getFCMToken();
console.log('FCM Token:', token);
```

## 🔧 Configuration

### Lock Screen Modes

Configure in `callx.json`:

```json
{
  "app": {
    "showOverLockscreen": true,  // Show over lock screen
    "requireUnlock": false       // Require unlock to interact
  }
}
```

**Modes:**
- `showOverLockscreen: true, requireUnlock: false` - Standard mode (show over lock screen, allow interaction)
- `showOverLockscreen: true, requireUnlock: true` - High security mode (show over lock screen, require unlock)
- `showOverLockscreen: false, requireUnlock: true` - Secure mode (require unlock first)
- `showOverLockscreen: false, requireUnlock: false` - Minimal mode (standard behavior)

### FCM Triggers

Configure triggers in `callx.json`:

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
  }
}
```

### Data Fields

Configure data extraction in `callx.json`:

```json
{
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
  }
}
```

## 📋 API Reference

### CallxInstance

#### `initialize(config?: CallxConfig): Promise<void>`
Initialize Callx with optional configuration.

#### `showIncomingCall(callData: CallData): Promise<void>`
Show incoming call interface.

#### `handleFcmMessage(data: any): Promise<void>`
Handle FCM message manually.

#### `getFCMToken(): Promise<string>`
Get current FCM token.

#### `getCurrentCall(): Promise<CallData | null>`
Get current active call.

#### `isCallActive(): Promise<boolean>`
Check if call is currently active.

#### `answerCall(callId: string): Promise<void>`
Answer incoming call.

#### `declineCall(callId: string): Promise<void>`
Decline incoming call.

#### `endCall(callId: string): Promise<void>`
End current call.

### Types

```typescript
interface CallData {
  callId: string;
  callerName: string;
  callerPhone: string;
  callerAvatar?: string;
  timestamp?: number;
}

interface CallxConfig {
  onIncomingCall?: (callData: CallData) => void;
  onCallAnswered?: (callData: CallData) => void;
  onCallDeclined?: (callData: CallData) => void;
  onCallEnded?: (callData: CallData) => void;
  onCallMissed?: (callData: CallData) => void;
}
```

## 🐛 Troubleshooting

### FCM Not Working
1. Check `google-services.json` is in `android/app/`
2. Verify package name matches in `google-services.json`
3. Check Firebase console configuration

### Lock Screen Not Working
1. Verify `callx.json` is in `android/app/src/main/assets/`
2. Check configuration values
3. Test on physical device (emulator may not work)
4. Check if Application extends `CallxApplication`

### Build Errors
1. Clean and rebuild: `cd android && ./gradlew clean`
2. Check Firebase dependencies versions
3. Verify Kotlin version compatibility

## 🚧 Roadmap

### Coming Soon
- **📱 iOS Support** - Full iOS implementation with CallKit integration
- **⚡ Expo Support** - Expo plugin and managed workflow support
- **🎨 Custom Themes** - More UI customization options
- **🔔 PushKit Integration** - Better iOS push notification handling

### Support Development
**[☕ Buy me a coffee](https://coff.ee/bearblock)** to support the development of:
- iOS support with CallKit
- Expo plugin development
- Additional features and improvements

## 📱 Example

See the [example](./example) directory for a complete working implementation.

## 📄 License

MIT License - see [LICENSE](./LICENSE) for details.

## 🤝 Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for contribution guidelines.

## 📚 Documentation

- [Android Setup Guide](./ANDROID_SETUP_GUIDE.md)
- [Build Configuration Guide](./README_BUILD_CONFIG.md)
- [FCM Configuration](./FCM_CONFIGURATION.md)
- [Lock Screen Management](./LOCKSCREEN_MANAGEMENT.md)
