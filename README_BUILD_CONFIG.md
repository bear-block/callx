# Callx Configuration from Assets

## Overview

Callx now supports **persistent configuration** via assets - your configuration is read from a JSON file and persists even when the app is killed, eliminating the need to initialize with config every time.

## How it works

1. **Configuration File**: Place `callx.json` in `android/src/main/assets/`
2. **Build Time**: JSON file is included in the APK assets
3. **Runtime**: Native module reads configuration from assets automatically

## Setup

### 1. Create `callx.json` in your project root:

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
    "channelId": "callx_incoming_calls",
    "channelName": "Incoming Calls",
    "channelDescription": "Notifications for incoming calls",
    "importance": "high",
    "sound": "default"
  }
}
```

### 2. Simplified JavaScript initialization:

```javascript
// Before (had to pass full config every time)
await CallxInstance.initialize({
  triggers: {
    /* full config */
  },
  fields: {
    /* full config */
  },
  // ...
});

// After (config is pre-compiled!)
await CallxInstance.initialize({
  // Only event listeners needed
  onIncomingCall: (callData) => console.log('Call:', callData),
  onCallEnded: (callData) => console.log('Ended:', callData),
});
```

## Benefits

✅ **Persistent Configuration**: Config survives app kills  
✅ **Better Performance**: No runtime file loading or parsing  
✅ **Type Safety**: Compile-time validation  
✅ **Simpler Code**: Less configuration in JavaScript  
✅ **Background FCM**: Works immediately even when app is killed

## Generated Files

During build, Gradle generates:

```
android/build/generated/source/callx/com/callx/CallxConfig.kt
```

This file contains your configuration as Kotlin constants and is automatically included in the build.

## Updating Configuration

1. Edit `callx.json`
2. Clean build: `cd android && ./gradlew clean`
3. Rebuild: `cd android && ./gradlew build`

The new configuration will be compiled into your app!
