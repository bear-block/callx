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

# Build Configuration Guide

This guide explains how to configure your app's build files to work with Callx.

## 🔧 Required Configuration

### 1. Root build.gradle

Add the Google Services plugin to your project's root `build.gradle`:

```gradle
buildscript {
    dependencies {
        // ... existing dependencies
        classpath 'com.google.gms:google-services:4.4.0'
    }
}
```

### 2. App build.gradle

Add the Google Services plugin and Firebase dependencies to your app's `build.gradle`:

```gradle
apply plugin: "com.google.gms.google-services"

dependencies {
    // ... existing dependencies
    
    // Firebase dependencies
    implementation platform('com.google.firebase:firebase-bom:33.16.0')
    implementation 'com.google.firebase:firebase-messaging'
    implementation 'com.google.firebase:firebase-analytics'
}
```

### 3. AndroidManifest.xml

Add the FCM service to your `AndroidManifest.xml`:

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

## 🚀 Auto-Configuration

The library includes auto-linking support, so these configurations should be automatically applied when you install the library. However, if you encounter build errors, you may need to add them manually.

## 📝 Example Configuration

See the `example/android/` directory for a complete working configuration.

## 🐛 Troubleshooting

### "Google Services plugin needs to be applied on a project with com.android.application"

This error occurs when the Google Services plugin is applied to a library project instead of an application project. The plugin should only be applied to your app's `build.gradle`, not the library's.

### Build Errors

1. Clean and rebuild: `cd android && ./gradlew clean`
2. Check Firebase dependencies versions
3. Verify Kotlin version compatibility
4. Ensure `google-services.json` is in the correct location
