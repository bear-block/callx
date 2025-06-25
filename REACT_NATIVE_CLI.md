# Callx React Native CLI Setup

This document provides detailed instructions for setting up the Callx library with React Native CLI.

## Installation

```sh
npm install callx
```

## Manual Setup

### 1. Link the Library

If auto-linking doesn't work, manually link the library:

```sh
npx react-native link callx
```

### 2. Android Configuration

#### Add Firebase Dependencies

Add to `android/app/build.gradle`:

```gradle
dependencies {
    // ... existing dependencies
    
    // Firebase Messaging
    implementation 'com.google.firebase:firebase-messaging:23.4.0'
    implementation 'com.google.firebase:firebase-analytics:21.5.0'
    
    // Callx dependencies
    implementation 'androidx.core:core:1.10.0'
    implementation 'androidx.appcompat:appcompat:1.6.1'
    implementation 'com.google.android.material:material:1.9.0'
}
```

#### Add Google Services Plugin

In `android/build.gradle`:

```gradle
buildscript {
    repositories {
        google()
        mavenCentral()
    }
    dependencies {
        // ... existing dependencies
        classpath 'com.google.gms:google-services:4.4.0'
    }
}
```

In `android/app/build.gradle`:

```gradle
// Apply at the top of the file
apply plugin: 'com.google.gms.google-services'

android {
    // ... existing configuration
}
```

#### Add Firebase Configuration

1. Download `google-services.json` from Firebase Console
2. Place it in `android/app/` directory

### 3. Permissions

The library automatically adds required permissions, but you can verify them in `android/app/src/main/AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.WAKE_LOCK" />
<uses-permission android:name="android.permission.VIBRATE" />
<uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
```

### 4. ProGuard Rules (Optional)

If you're using ProGuard, add to `android/app/proguard-rules.pro`:

```pro
# Callx
-keep class com.callx.** { *; }
-keep class com.google.firebase.messaging.** { *; }
```

## Configuration

### Basic Setup

In your main application file (e.g., `App.js` or `index.js`):

```javascript
import { Callx } from 'callx';

// Initialize Callx
Callx.initialize({
  onIncomingCall: (callData) => {
    console.log('Incoming call:', callData);
    // Handle incoming call
  },
  onCallEnded: (callData) => {
    console.log('Call ended:', callData);
    // Handle call ended
  },
  onCallMissed: (callData) => {
    console.log('Call missed:', callData);
    // Handle missed call
  }
});
```

### Advanced Configuration

```javascript
import { Callx } from 'callx';

const callxConfig = {
  // Custom FCM triggers
  triggers: {
    incoming: {
      field: 'data.callStatus',
      value: 'incoming'
    },
    ended: {
      field: 'data.callStatus',
      value: 'completed'
    },
    missed: {
      field: 'data.callStatus',
      value: 'missed'
    }
  },
  
  // Field mapping with fallbacks
  fields: {
    callId: {
      field: 'data.call.id',
      fallback: 'unknown-call'
    },
    callerName: {
      field: 'data.caller.name',
      fallback: 'Unknown Caller'
    },
    callerPhone: {
      field: 'data.caller.phone',
      fallback: 'No Number'
    },
    callerAvatar: {
      field: 'data.caller.avatar',
      fallback: null
    }
  },
  
  // Event callbacks
  onIncomingCall: (callData) => {
    // Show incoming call UI
    showIncomingCallScreen(callData);
  },
  onCallEnded: (callData) => {
    // Hide call UI
    hideCallScreen();
  },
  onCallMissed: (callData) => {
    // Show missed call notification
    showMissedCallNotification(callData);
  },
  
  // Notification settings
  notification: {
    channelId: 'callx_incoming_calls',
    channelName: 'Incoming Calls',
    channelDescription: 'Notifications for incoming calls',
    importance: 'high',
    sound: 'default'
  }
};

Callx.initialize(callxConfig);
```

## Firebase Setup

### 1. Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project or select existing one
3. Enable Cloud Messaging

### 2. Add Android App

1. Click "Add app" → Android
2. Enter your package name (e.g., `com.yourapp.name`)
3. Download `google-services.json`
4. Place it in `android/app/` directory

### 3. Get FCM Server Key

1. Go to Project Settings → Cloud Messaging
2. Copy the Server key for sending notifications

## Testing

### Send Test FCM Message

```bash
curl -X POST -H "Authorization: key=YOUR_SERVER_KEY" \
     -H "Content-Type: application/json" \
     -d '{
       "to": "DEVICE_FCM_TOKEN",
       "data": {
         "type": "call.started",
         "callId": "test-call-123",
         "callerName": "Test User",
         "callerPhone": "+1234567890",
         "callerAvatar": "https://example.com/avatar.jpg"
       },
       "notification": {
         "title": "Incoming Call",
         "body": "Test User is calling..."
       }
     }' \
     https://fcm.googleapis.com/fcm/send
```

### Test with Missing Fields

```bash
curl -X POST -H "Authorization: key=YOUR_SERVER_KEY" \
     -H "Content-Type: application/json" \
     -d '{
       "to": "DEVICE_FCM_TOKEN",
       "data": {
         "type": "call.started",
         "callId": "test-call-123"
         // callerName and callerPhone are missing, will use fallback values
       },
       "notification": {
         "title": "Incoming Call",
         "body": "Unknown Caller is calling..."
       }
     }' \
     https://fcm.googleapis.com/fcm/send
```

### Get FCM Token

```javascript
import { Callx } from 'callx';

// Get current FCM token
Callx.getFCMToken().then(token => {
  console.log('FCM Token:', token);
});
```

## Build and Run

### Development

```sh
# Clean and rebuild
cd android && ./gradlew clean && cd ..
npx react-native run-android
```

### Production

```sh
cd android && ./gradlew assembleRelease
```

## Troubleshooting

### Common Issues

1. **Build errors:**
   ```sh
   cd android && ./gradlew clean
   cd .. && npx react-native run-android
   ```

2. **FCM not working:**
   - Verify `google-services.json` is in correct location
   - Check Firebase project configuration
   - Ensure device has internet connection

3. **Permissions issues:**
   - Check AndroidManifest.xml for required permissions
   - Request notification permissions at runtime (Android 13+)

4. **Auto-linking issues:**
   ```sh
   npx react-native link callx
   npx react-native run-android
   ```

5. **Field mapping issues:**
   - Verify field paths match your FCM data structure
   - Test with missing fields to verify fallbacks
   - Check debug logs for field mapping errors

### Debug Mode

Enable debug logging:

```javascript
import { Callx } from 'callx';

Callx.setDebugMode(true);
```

### Verification Steps

1. Check if FCM token is generated
2. Verify Firebase configuration is loaded
3. Test with FCM message
4. Check logs for any errors
5. Test with missing fields to verify fallback values

## Migration from Expo

If migrating from Expo to React Native CLI:

1. Remove Expo plugin configuration
2. Follow manual setup steps above
3. Update import statements if needed
4. Test FCM integration

## Support

For React Native CLI specific issues:

1. Check React Native documentation
2. Verify all dependencies are correctly linked
3. Test with minimal configuration
4. Check Android build logs 