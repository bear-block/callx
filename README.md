# 📞 Callx - React Native Incoming Call Library

A powerful React Native library for handling incoming calls with native UI integration. Supports both iOS (CallKit) and Android (ConnectionService) with full native performance.

## ✨ Features

- **🎯 Native UI Integration**: CallKit (iOS) and ConnectionService (Android)
- **📱 Cross-Platform**: Full support for both iOS and Android
- **🔥 FCM Integration**: Firebase Cloud Messaging for push notifications
- **📞 VoIP Support**: iOS PushKit for VoIP calls
- **🎥 Video Call Support**: Native video call UI integration
- **📋 Call Logging**: Automatic call history logging with granular control
- **🔄 Call End Scenarios**: Comprehensive handling of all call end cases
- **⚡ Expo Plugin**: Automatic project configuration
- **🎨 Beautiful UI**: Customizable native call screens
- **🔒 Lock Screen**: Full-screen call UI over lock screen
- **📊 Event System**: Rich JavaScript event system

## 🚀 Quick Start

### Installation

```bash
# Using npm
npm install @bear-block/callx

# Using yarn
yarn add @bear-block/callx
```

### Basic Setup

```typescript
import Callx from '@bear-block/callx';

// Initialize Callx
await Callx.initialize({
  onIncomingCall: (callData) => {
    console.log('📞 Incoming call:', callData);
  },
  onCallAnswered: (callData) => {
    console.log('✅ Call answered:', callData);
  },
  onCallEnded: (callData) => {
    console.log('📵 Call ended:', callData);
  },
});

// Handle FCM message
await Callx.handleFcmMessage(fcmData);
```

## 📱 Platform Support

| Feature | iOS | Android |
|---------|-----|---------|
| Native UI | ✅ CallKit | ✅ ConnectionService |
| Push Notifications | ✅ PushKit | ✅ FCM |
| Lock Screen | ✅ Native | ✅ Custom |
| Video Calls | ✅ Native | ✅ Native |
| Call Logging | ✅ Native | ✅ Native |
| Background Processing | ✅ Native | ✅ Native |

## 🔧 Configuration

### callx.json

Create a `callx.json` file in your project root:

```json
{
  "app": {
    "packageName": "com.yourcompany.yourapp",
    "mainActivity": "MainActivity",
    "showOverLockscreen": true,
    "requireUnlock": false,
    "supportsVideo": true
  },
  "triggers": {
    "incoming": {
      "field": "type",
      "value": "call.started"
    },
    "ended": {
      "field": "type", 
      "value": "call.ended"
    },
    "answered_elsewhere": {
      "field": "type",
      "value": "call.answered_elsewhere"
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
    "hasVideo": {
      "field": "hasVideo",
      "fallback": false
    }
  },
  "notification": {
    "channelId": "callx_calls",
    "channelName": "Calls",
    "channelDescription": "Incoming call notifications",
    "importance": "high"
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

## 📋 API Reference

### Core Methods

```typescript
// Initialize Callx
await Callx.initialize(config: CallxConfig): Promise<void>

// Show incoming call UI
await Callx.showIncomingCall(callData: CallData): Promise<void>

// Handle FCM message
await Callx.handleFcmMessage(data: any): Promise<void>

// Get tokens
await Callx.getFCMToken(): Promise<string>
await Callx.getVoIPToken(): Promise<string> // iOS only

// Call actions
await Callx.answerCall(callId: string): Promise<void>
await Callx.declineCall(callId: string): Promise<void>
await Callx.endCall(callId: string): Promise<void>

// Status
await Callx.getCurrentCall(): Promise<CallData | null>
await Callx.isCallActive(): Promise<boolean>
```

### Event Listeners

```typescript
interface CallxConfig {
  onIncomingCall?: (callData: CallData) => void;
  onCallAnswered?: (callData: CallData) => void;
  onCallDeclined?: (callData: CallData) => void;
  onCallEnded?: (callData: CallData) => void;
  onCallMissed?: (callData: CallData) => void;
  onCallAnsweredElsewhere?: (callData: CallData) => void;
  onCallTimeout?: (callData: CallData) => void;
  onCallCancelled?: (callData: CallData) => void;
  onCallBusy?: (callData: CallData) => void;
  onCallRejected?: (callData: CallData) => void;
  onVoIPTokenUpdated?: (tokenData: { token: string }) => void;
}
```

### Call Data Structure

```typescript
interface CallData {
  callId: string;
  callerName: string;
  callerPhone: string;
  callerAvatar?: string;
  hasVideo?: boolean;
  endReason?: 'answered_elsewhere' | 'timeout' | 'cancelled' | 'busy' | 'rejected' | 'declined' | 'missed' | 'ended' | 'unknown';
  answeredBy?: string;
  deviceType?: string;
  duration?: number;
  timestamp?: number;
}
```

## 🎥 Video Call Support

Callx supports both voice and video calls:

**App Configuration:**
```json
{
  "app": {
    "supportsVideo": true  // Enable video call support
  }
}
```

**Call Data:**
```typescript
interface CallData {
  callId: string;
  callerName: string;
  callerPhone: string;
  callerAvatar?: string;
  hasVideo?: boolean;  // true for video calls, false for voice calls
  endReason?: string;  // Call end reason
  answeredBy?: string; // Who answered the call
  deviceType?: string; // Device type that answered
  duration?: number;   // Call duration in seconds
  timestamp?: number;
}
```

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

## 📞 Call End Scenarios

Callx supports comprehensive call end scenarios:

**Supported Triggers:**
```json
{
  "triggers": {
    "incoming": { "field": "type", "value": "call.started" },
    "ended": { "field": "type", "value": "call.ended" },
    "missed": { "field": "type", "value": "call.missed" },
    "answered_elsewhere": { "field": "type", "value": "call.answered_elsewhere" },
    "declined": { "field": "type", "value": "call.declined" },
    "timeout": { "field": "type", "value": "call.timeout" },
    "cancelled": { "field": "type", "value": "call.cancelled" },
    "busy": { "field": "type", "value": "call.busy" },
    "rejected": { "field": "type", "value": "call.rejected" }
  }
}
```

**Call End Events:**
```typescript
// Call answered on another device
onCallAnsweredElsewhere?: (callData: CallData) => void;

// Call timed out
onCallTimeout?: (callData: CallData) => void;

// Call was cancelled by caller
onCallCancelled?: (callData: CallData) => void;

// User is busy (on another call)
onCallBusy?: (callData: CallData) => void;

// Call was rejected
onCallRejected?: (callData: CallData) => void;
```

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

## 📋 Call Logging

Callx can automatically log calls to the phone's native call history:

**Configuration:**
```json
{
  "callLogging": {
    "enabled": true,           // Master switch for call logging
    "logAnswered": true,       // Log answered calls
    "logDeclined": true,       // Log declined calls  
    "logMissed": true,         // Log missed calls
    "logDuration": true,       // Track call duration
    "logCallerInfo": true      // Log caller name and info
  }
}
```

**Android Permissions:**
```xml
<uses-permission android:name="android.permission.WRITE_CALL_LOG" />
<uses-permission android:name="android.permission.READ_CALL_LOG" />
```

**iOS Integration:**
- CallKit automatically handles call logging
- No additional permissions required

## 🔧 Setup Instructions

### React Native CLI Setup

#### Android

1. **Add Permissions** to `android/app/src/main/AndroidManifest.xml`:
```xml
<uses-permission android:name="android.permission.VIBRATE" />
<uses-permission android:name="android.permission.WAKE_LOCK" />
<uses-permission android:name="android.permission.USE_FULL_SCREEN_INTENT" />
<uses-permission android:name="android.permission.SYSTEM_ALERT_WINDOW" />
<uses-permission android:name="android.permission.WRITE_CALL_LOG" />
<uses-permission android:name="android.permission.READ_CALL_LOG" />
```

2. **Extend MainActivity** in `android/app/src/main/java/com/yourapp/MainActivity.kt`:
```kotlin
import com.callx.CallxReactActivity

class MainActivity : CallxReactActivity() {
    // Your existing code
}
```

#### iOS

1. **Add Background Modes** to `ios/YourApp/Info.plist`:
```xml
<key>UIBackgroundModes</key>
<array>
    <string>voip</string>
    <string>remote-notification</string>
    <string>background-fetch</string>
</array>
```

2. **Add Privacy Descriptions**:
```xml
<key>NSMicrophoneUsageDescription</key>
<string>This app needs microphone access for calls</string>
<key>NSCameraUsageDescription</key>
<string>This app needs camera access for video calls</string>
```

### Expo Setup

Add the plugin to your `app.json`:

```json
{
  "expo": {
    "plugins": [
      "@bear-block/callx"
    ]
  }
}
```

The plugin will automatically:
- Copy `callx.json` to the app bundle
- Add required permissions
- Configure MainActivity (Android)
- Configure Info.plist (iOS)

## 🔥 FCM Integration

### Android

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

### iOS

For iOS, you need to send VoIP push notifications using the VoIP token:

```typescript
// Get VoIP token
const voipToken = await Callx.getVoIPToken();

// Listen for token updates
Callx.initialize({
  onVoIPTokenUpdated: (tokenData) => {
    console.log('VoIP token updated:', tokenData.token);
  }
});
```

## 🧪 Testing

### Manual Testing

1. **Android**: Use the test app to simulate incoming calls
2. **iOS**: Use a physical device (CallKit doesn't work in simulator)

### Automated Testing

```bash
# Run tests
yarn test

# Run tests in watch mode
yarn test:watch
```

## 📚 Examples

See the `example/` directory for complete working examples.

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

- 📖 [Documentation](https://github.com/bear-block/callx)
- 🐛 [Issues](https://github.com/bear-block/callx/issues)
- 💬 [Discussions](https://github.com/bear-block/callx/discussions)

---

**Made with ❤️ by Bear Block**
