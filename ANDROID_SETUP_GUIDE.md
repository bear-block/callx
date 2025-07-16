# Android Setup Guide for Callx

This guide explains how to set up Callx in your React Native Android app with minimal manual configuration.

## 🚀 Quick Setup

### 1. Install Callx

```bash
yarn add @bear-block/callx
```

### 2. Add Firebase Configuration

Add your `google-services.json` file to `android/app/` directory.

### 3. Update Application Class (Optional)

For automatic initialization, extend `CallxApplication`:

```kotlin
// android/app/src/main/java/com/yourapp/MainApplication.kt
package com.yourapp

import com.callx.CallxApplication
import com.facebook.react.ReactApplication
// ... other imports

class MainApplication : CallxApplication(), ReactApplication {
  // Your existing ReactApplication implementation
}
```

**Note:** If you don't want to change your Application class, Callx will still work but you may need to manually initialize it.

### 4. Add Configuration (Optional)

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

## 🔧 Advanced Configuration

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

## 🔍 Manual Setup (If Needed)

If you prefer manual setup or have conflicts:

### 1. Root build.gradle
```gradle
buildscript {
  dependencies {
    classpath 'com.google.gms:google-services:4.4.0'
  }
}
```

### 2. App build.gradle
```gradle
apply plugin: "com.google.gms.google-services"

dependencies {
  implementation platform('com.google.firebase:firebase-bom:33.16.0')
  implementation 'com.google.firebase:firebase-messaging'
  implementation 'com.google.firebase:firebase-analytics'
}
```

### 3. AndroidManifest.xml
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

### 4. Manual Activity Setup (If auto-detection fails)

If you need manual control, you can still use the helper:

```kotlin
class MainActivity : ReactActivity() {
  private lateinit var callxHelper: CallxActivityHelper
  
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    callxHelper = CallxActivityHelper(this)
    callxHelper.handleCallAnswer()
  }
  
  override fun onNewIntent(intent: Intent?) {
    super.onNewIntent(intent)
    setIntent(intent)
    callxHelper.handleCallAnswer()
  }
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

## 📱 Testing

Use the example app to test FCM integration:

```bash
cd example
yarn install
yarn android
```

Then send test FCM messages using the test server:

```bash
cd example/callx-server
node index.js
``` 