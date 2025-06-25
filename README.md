# Callx

A React Native library for managing incoming calls on Android through FCM (Firebase Cloud Messaging) with full-screen notification support and Material Design 3 UI.

## Features

- 🔔 **FCM Integration**: Handle incoming calls through Firebase Cloud Messaging
- 📱 **Full Screen Notifications**: Display incoming calls as full-screen notifications (not native phone calls)
- 🎨 **Material Design 3**: Beautiful, modern UI following Google's Material Design 3 guidelines
- ⚡ **Native Performance**: Fast call display with native Android implementation
- 🔧 **Flexible Configuration**: Customizable FCM data mapping for different call states
- 📦 **Expo Support**: Works with both Expo and React Native CLI
- 🎯 **Smart Field Mapping**: Configurable field paths with fallback values
- 🎛️ **Dual Handling Modes**: Native automatic handling or custom manual control
- 🔊 **Event Listeners**: JavaScript listeners for answer/decline call actions
- 🎪 **Customizable UI**: Support for custom themes and branding

## Installation

```sh
npm install callx
```

## Setup

### React Native CLI

1. **Install the library:**
```sh
npm install callx
```

2. **Link the library (if not using auto-linking):**
```sh
npx react-native link callx
```

3. **Add Firebase dependencies to `android/app/build.gradle`:**
```gradle
dependencies {
    // ... other dependencies
    implementation 'com.google.firebase:firebase-messaging:23.4.0'
    implementation 'com.google.firebase:firebase-analytics:21.5.0'
}
```

4. **Add Google Services plugin to `android/build.gradle`:**
```gradle
buildscript {
    dependencies {
        // ... other dependencies
        classpath 'com.google.gms:google-services:4.4.0'
    }
}
```

5. **Apply Google Services plugin in `android/app/build.gradle`:**
```gradle
apply plugin: 'com.google.gms.google-services'
```

6. **Add your `google-services.json` file to `android/app/`**

### Expo

1. **Install the library:**
```sh
npx expo install callx
```

2. **Configure the plugin in `app.json` or `app.config.js`:**

```json
{
  "expo": {
    "plugins": [
      [
        "callx",
        {
          "android": {
            "triggers": {
              "incoming": {
                "field": "data.type",
                "value": "call.started"
              },
              "ended": {
                "field": "data.type", 
                "value": "call.ended"
              },
              "missed": {
                "field": "data.type",
                "value": "call.missed"
              }
            },
            "fields": {
              "callId": {
                "field": "data.callId",
                "fallback": "unknown-call"
              },
              "callerName": {
                "field": "data.callerName",
                "fallback": "Unknown Caller"
              },
              "callerPhone": {
                "field": "data.callerPhone",
                "fallback": "No Number"
              },
              "callerAvatar": {
                "field": "data.callerAvatar",
                "fallback": null
              }
            },
            "notification": {
              "channelId": "callx_incoming_calls",
              "channelName": "Incoming Calls",
              "channelDescription": "Notifications for incoming calls",
              "importance": "high",
              "sound": "default"
            },
            "handling": {
              "mode": "native",
              "enableCustomUI": false
            }
          }
        }
      ]
    ]
  }
}
```

Or in `app.config.js`:

```javascript
export default {
  expo: {
    plugins: [
      [
        'callx',
        {
          android: {
            triggers: {
              incoming: {
                field: 'data.type',
                value: 'call.started'
              },
              ended: {
                field: 'data.type',
                value: 'call.ended'
              },
              missed: {
                field: 'data.type',
                value: 'call.missed'
              }
            },
            fields: {
              callId: {
                field: 'data.callId',
                fallback: 'unknown-call'
              },
              callerName: {
                field: 'data.callerName',
                fallback: 'Unknown Caller'
              },
              callerPhone: {
                field: 'data.callerPhone',
                fallback: 'No Number'
              },
              callerAvatar: {
                field: 'data.callerAvatar',
                fallback: null
              }
            },
            notification: {
              channelId: 'callx_incoming_calls',
              channelName: 'Incoming Calls',
              channelDescription: 'Notifications for incoming calls',
              importance: 'high',
              sound: 'default'
            },
            handling: {
              mode: 'native',
              enableCustomUI: false
            }
          }
        }
      ]
    ]
  }
};
```

## Material Design 3 UI

Callx features a beautiful Material Design 3 interface for incoming calls:

### UI Components

- **Caller Avatar**: Circular avatar with caller's initial or custom image
- **Caller Information**: Name and phone number display
- **Call Status**: "Incoming call..." indicator
- **Action Buttons**: Material Design 3 FloatingActionButton for answer/decline
- **Color Scheme**: Dynamic theming with Material Design 3 color system
- **Typography**: Material Design 3 typography scale
- **Spacing**: Consistent spacing following Material Design guidelines

### Customization

The UI can be customized through themes and styling:

```xml
<!-- android/src/main/res/values/styles.xml -->
<style name="Theme.Callx.IncomingCall" parent="Theme.Material3.DayNight.NoActionBar">
    <item name="android:windowBackground">@android:color/transparent</item>
    <item name="android:windowTranslucentStatus">true</item>
    <item name="android:windowTranslucentNavigation">true</item>
    <item name="android:windowFullscreen">true</item>
    <item name="android:windowShowWallpaper">false</item>
    <item name="android:windowIsTranslucent">false</item>
    <item name="android:windowAnimationStyle">@android:style/Animation.Dialog</item>
</style>
```

## Event Listeners

Callx provides JavaScript event listeners for call actions:

### Setup Event Listeners

```javascript
import { 
  initialize, 
  onAnswerCall, 
  onDeclineCall, 
  onIncomingCall, 
  onEndedCall, 
  onMissedCall 
} from 'callx';

// Initialize Callx
await initialize({
  triggers: {
    incoming: { field: 'type', value: 'incoming_call' },
    ended: { field: 'type', value: 'call_ended' },
    missed: { field: 'type', value: 'call_missed' }
  },
  callerData: {
    callId: 'id',
    callerName: 'name',
    callerNumber: 'phone',
    callerAvatar: 'avatar'
  },
  handlingMode: 'native',
  notification: {
    channelId: 'callx_calls',
    channelName: 'Incoming Calls',
    channelDescription: 'Notifications for incoming calls',
    sound: 'default',
    vibration: true
  }
});

// Set up event listeners
onAnswerCall((callId) => {
  console.log('Call answered:', callId);
  // Handle call answer logic
  // e.g., start VoIP call, navigate to call screen, etc.
});

onDeclineCall((callId) => {
  console.log('Call declined:', callId);
  // Handle call decline logic
  // e.g., send decline signal to server, show missed call notification, etc.
});

onIncomingCall((callId) => {
  console.log('Incoming call received:', callId);
  // This event is fired when FCM receives an incoming call
  // In native mode, the UI is handled automatically
});

onEndedCall((callId) => {
  console.log('Call ended:', callId);
  // Handle call end logic
  // e.g., cleanup call resources, show call summary, etc.
});

onMissedCall((callId) => {
  console.log('Call missed:', callId);
  // Handle missed call logic
  // e.g., show missed call notification, update call history, etc.
});
```

### Event Flow

1. **FCM Message Received**: Firebase Cloud Messaging receives a call notification
2. **Native Processing**: Android native code processes the FCM data
3. **UI Display**: Material Design 3 UI is shown (in native mode)
4. **User Action**: User taps answer or decline button
5. **Event Emission**: Native code emits event to JavaScript
6. **JS Handler**: Your JavaScript event listener handles the action
7. **Custom Logic**: Execute your custom call handling logic

### Example Usage

```javascript
import React, { useEffect } from 'react';
import { Alert } from 'react-native';
import { 
  initialize, 
  onAnswerCall, 
  onDeclineCall, 
  showIncomingCall 
} from 'callx';

const App = () => {
  useEffect(() => {
    const setupCallx = async () => {
      // Initialize Callx
      await initialize({
        triggers: {
          incoming: { field: 'type', value: 'incoming_call' },
          ended: { field: 'type', value: 'call_ended' },
          missed: { field: 'type', value: 'call_missed' }
        },
        callerData: {
          callId: 'id',
          callerName: 'name',
          callerNumber: 'phone',
          callerAvatar: 'avatar'
        },
        handlingMode: 'native',
        notification: {
          channelId: 'callx_calls',
          channelName: 'Incoming Calls',
          channelDescription: 'Notifications for incoming calls',
          sound: 'default',
          vibration: true
        }
      });

      // Set up event listeners
      onAnswerCall((callId) => {
        Alert.alert('Call Answered', `Call ${callId} was answered`);
        // Start your VoIP call here
        startVoIPCall(callId);
      });

      onDeclineCall((callId) => {
        Alert.alert('Call Declined', `Call ${callId} was declined`);
        // Send decline signal to your server
        sendDeclineSignal(callId);
      });
    };

    setupCallx();
  }, []);

  const testIncomingCall = async () => {
    await showIncomingCall({
      callId: 'test-call-123',
      callerName: 'John Doe',
      callerNumber: '+1234567890',
      callerAvatar: 'https://example.com/avatar.jpg'
    });
  };

  return (
    // Your app UI
  );
};
```

## Handling Modes

### 1. Native Mode (Default)

The library automatically handles incoming calls with full-screen notifications:

```javascript
import { Callx } from 'callx';

Callx.initialize({
  handling: {
    mode: 'native', // Default - automatic handling
    enableCustomUI: false
  },
  // Listeners for additional custom logic
  onIncomingCall: (callData) => {
    console.log('Incoming call detected:', callData);
    // Native UI will be shown automatically
  },
  onCallEnded: (callData) => {
    console.log('Call ended:', callData);
    // Native UI will be dismissed automatically
  },
  onCallMissed: (callData) => {
    console.log('Call missed:', callData);
    // Native UI will be dismissed automatically
  }
});
```

### 2. Custom Mode

You handle the UI and logic yourself:

```javascript
import { Callx } from 'callx';

Callx.initialize({
  handling: {
    mode: 'custom', // Custom handling
    enableCustomUI: true
  },
  // Required listeners for custom handling
  onIncomingCall: (callData) => {
    console.log('Incoming call:', callData);
    // Show your custom incoming call UI
    showCustomIncomingCallScreen(callData);
  },
  onCallEnded: (callData) => {
    console.log('Call ended:', callData);
    // Hide your custom UI
    hideCustomCallScreen();
  },
  onCallMissed: (callData) => {
    console.log('Call missed:', callData);
    // Show your custom missed call notification
    showCustomMissedCallNotification(callData);
  }
});
```

### 3. Hybrid Mode

Native handling with custom UI overlay:

```javascript
import { Callx } from 'callx';

Callx.initialize({
  handling: {
    mode: 'hybrid', // Native + custom UI
    enableCustomUI: true
  },
  onIncomingCall: (callData) => {
    console.log('Incoming call:', callData);
    // Native UI will be shown, plus your custom overlay
    showCustomCallOverlay(callData);
  },
  onCallEnded: (callData) => {
    console.log('Call ended:', callData);
    // Hide your custom overlay
    hideCustomCallOverlay();
  }
});
```

## FCM Configuration

### FCM Data Structure

Your FCM payload should follow this structure:

```json
{
  "data": {
    "type": "call.started",
    "callId": "unique-call-id",
    "callerName": "John Doe",
    "callerPhone": "+1234567890",
    "callerAvatar": "https://example.com/avatar.jpg"
  },
  "notification": {
    "title": "Incoming Call",
    "body": "John Doe is calling..."
  }
}
```

### Configuration Options

| Option | Type | Description | Default |
|--------|------|-------------|---------|
| `field` | string | Field path in FCM data | `data.type` |
| `value` | string | Expected value to trigger the action | `call.started` |
| `fallback` | any | Fallback value when field is missing | `null` |

### Call States

- **`incoming`**: Triggered when a new call arrives
- **`ended`**: Triggered when a call ends normally
- **`missed`**: Triggered when a call is missed

### Field Mapping

You can configure how FCM data fields are mapped to call data:

```javascript
fields: {
  callId: {
    field: 'data.callId',
    fallback: 'unknown-call'
  },
  callerName: {
    field: 'data.callerName',
    fallback: 'Unknown Caller'
  },
  callerPhone: {
    field: 'data.callerPhone',
    fallback: 'No Number'
  },
  callerAvatar: {
    field: 'data.callerAvatar',
    fallback: null
  }
}
```

## Usage Examples

### Native Mode Example

```javascript
import React from 'react';
import { Callx } from 'callx';

// Initialize Callx immediately when JS bundle starts
Callx.initialize({
  handling: {
    mode: 'native',
    enableCustomUI: false
  },
  onIncomingCall: (callData) => {
    console.log('Incoming call from:', callData.callerName);
    // Native full-screen notification will be shown automatically
  },
  onCallEnded: (callData) => {
    console.log('Call ended with ID:', callData.callId);
    // Native UI will be dismissed automatically
  },
  onCallMissed: (callData) => {
    console.log('Missed call from:', callData.callerName);
    // You can add custom logic here
  }
});

const App = () => {
  return (
    // Your app content
  );
};

export default App;
```

### Custom Mode Example

```javascript
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal } from 'react-native';
import { Callx } from 'callx';

// Initialize Callx immediately when JS bundle starts
Callx.initialize({
  handling: {
    mode: 'custom',
    enableCustomUI: true
  },
  onIncomingCall: (callData) => {
    console.log('Incoming call:', callData);
    // Show your custom incoming call UI
    // You can use a global state manager or event emitter here
    global.showIncomingCall(callData);
  },
  onCallEnded: (callData) => {
    console.log('Call ended:', callData);
    // Hide your custom UI
    global.hideIncomingCall();
  },
  onCallMissed: (callData) => {
    console.log('Call missed:', callData);
    // Show your custom missed call notification
    global.showMissedCall(callData);
  }
});

const App = () => {
  const [incomingCall, setIncomingCall] = useState(null);
  const [showCallModal, setShowCallModal] = useState(false);

  // Setup global handlers
  React.useEffect(() => {
    global.showIncomingCall = (callData) => {
      setIncomingCall(callData);
      setShowCallModal(true);
    };

    global.hideIncomingCall = () => {
      setShowCallModal(false);
      setIncomingCall(null);
    };

    global.showMissedCall = (callData) => {
      setShowCallModal(false);
      setIncomingCall(null);
      // Show your custom missed call notification
    };

    return () => {
      delete global.showIncomingCall;
      delete global.hideIncomingCall;
      delete global.showMissedCall;
    };
  }, []);

  const answerCall = () => {
    console.log('Answering call:', incomingCall?.callId);
    // Your call answering logic
    setShowCallModal(false);
  };

  const declineCall = () => {
    console.log('Declining call:', incomingCall?.callId);
    // Your call declining logic
    setShowCallModal(false);
  };

  return (
    <View style={{ flex: 1 }}>
      {/* Your app content */}
      
      {/* Custom incoming call modal */}
      <Modal visible={showCallModal} transparent>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center' }}>
          <View style={{ backgroundColor: 'white', padding: 20, borderRadius: 10 }}>
            <Text style={{ fontSize: 24, fontWeight: 'bold' }}>
              Incoming Call
            </Text>
            <Text style={{ fontSize: 18, marginVertical: 10 }}>
              {incomingCall?.callerName}
            </Text>
            <Text style={{ fontSize: 16, color: 'gray' }}>
              {incomingCall?.callerPhone}
            </Text>
            <View style={{ flexDirection: 'row', marginTop: 20 }}>
              <TouchableOpacity onPress={answerCall} style={{ backgroundColor: 'green', padding: 10, marginRight: 10 }}>
                <Text style={{ color: 'white' }}>Answer</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={declineCall} style={{ backgroundColor: 'red', padding: 10 }}>
                <Text style={{ color: 'white' }}>Decline</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

export default App;
```

### Hybrid Mode Example

```javascript
import React, { useState } from 'react';
import { View, Text } from 'react-native';
import { Callx } from 'callx';

// Initialize Callx immediately when JS bundle starts
Callx.initialize({
  handling: {
    mode: 'hybrid',
    enableCustomUI: true
  },
  onIncomingCall: (callData) => {
    console.log('Incoming call:', callData);
    // Native UI will be shown automatically
    // Plus your custom overlay
    global.showCallOverlay(callData);
  },
  onCallEnded: (callData) => {
    console.log('Call ended:', callData);
    // Hide your custom overlay
    global.hideCallOverlay();
  }
});

const App = () => {
  const [callOverlay, setCallOverlay] = useState(null);

  // Setup global handlers
  React.useEffect(() => {
    global.showCallOverlay = (callData) => {
      setCallOverlay(callData);
    };

    global.hideCallOverlay = () => {
      setCallOverlay(null);
    };

    return () => {
      delete global.showCallOverlay;
      delete global.hideCallOverlay;
    };
  }, []);

  return (
    <View style={{ flex: 1 }}>
      {/* Your app content */}
      
      {/* Custom overlay on top of native UI */}
      {callOverlay && (
        <View style={{ position: 'absolute', top: 50, right: 20, backgroundColor: 'white', padding: 10, borderRadius: 5 }}>
          <Text>Custom overlay for: {callOverlay.callerName}</Text>
        </View>
      )}
    </View>
  );
};

export default App;
```

### Using with State Management (Redux/Zustand)

```javascript
import React from 'react';
import { Callx } from 'callx';
import { useCallStore } from './stores/callStore';

// Initialize Callx immediately when JS bundle starts
Callx.initialize({
  handling: {
    mode: 'custom',
    enableCustomUI: true
  },
  onIncomingCall: (callData) => {
    console.log('Incoming call:', callData);
    // Use your state management
    global.callStore?.setIncomingCall(callData);
  },
  onCallEnded: (callData) => {
    console.log('Call ended:', callData);
    global.callStore?.clearIncomingCall();
  },
  onCallMissed: (callData) => {
    console.log('Call missed:', callData);
    global.callStore?.addMissedCall(callData);
  }
});

const App = () => {
  const { incomingCall, showCallModal, answerCall, declineCall } = useCallStore();

  return (
    <View style={{ flex: 1 }}>
      {/* Your app content */}
      
      {/* Call modal using state management */}
      {showCallModal && incomingCall && (
        <CallModal 
          call={incomingCall}
          onAnswer={answerCall}
          onDecline={declineCall}
        />
      )}
    </View>
  );
};

// Setup global store reference
import { callStore } from './stores/callStore';
global.callStore = callStore;

export default App;
```

## Firebase Setup

1. **Create a Firebase project** at [Firebase Console](https://console.firebase.google.com/)

2. **Add your Android app** to the Firebase project

3. **Download `google-services.json`** and place it in `android/app/`

4. **Enable Cloud Messaging** in Firebase Console

5. **Get your FCM Server Key** for sending notifications

### Sending Test Notifications

You can test the integration by sending FCM messages with the configured data structure:

```bash
curl -X POST -H "Authorization: key=YOUR_SERVER_KEY" \
     -H "Content-Type: application/json" \
     -d '{
       "to": "DEVICE_TOKEN",
       "data": {
         "type": "call.started",
         "callId": "test-call-123",
         "callerName": "Test User",
         "callerPhone": "+1234567890"
       },
       "notification": {
         "title": "Incoming Call",
         "body": "Test User is calling..."
       }
     }' \
     https://fcm.googleapis.com/fcm/send
```

## Permissions

The library requires the following Android permissions:

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.WAKE_LOCK" />
<uses-permission android:name="android.permission.VIBRATE" />
<uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
```

These permissions are automatically added by the library.

## Troubleshooting

### Common Issues

1. **FCM not receiving messages:**
   - Check if `google-services.json` is properly placed
   - Verify Firebase project configuration
   - Ensure device has internet connection

2. **Full-screen notification not showing:**
   - Check notification permissions
   - Verify FCM data structure matches configuration
   - Ensure app is not in foreground (full-screen shows when app is backgrounded)

3. **Expo build issues:**
   - Run `npx expo prebuild --clean`
   - Ensure plugin configuration is correct
   - Check Expo SDK compatibility

### Debug Mode

Enable debug logging:

```javascript
Callx.setDebugMode(true);
```

## API Reference

### Methods

- `Callx.initialize(config)`: Initialize the library
- `Callx.cleanup()`: Clean up resources
- `Callx.setDebugMode(enabled)`: Enable/disable debug logging
- `Callx.getFCMToken()`: Get current FCM token

### Configuration

```typescript
interface CallxConfig {
  triggers?: {
    incoming: FCMTrigger;
    ended: FCMTrigger;
    missed: FCMTrigger;
  };
  fields?: {
    callId: FieldMapping;
    callerName: FieldMapping;
    callerPhone: FieldMapping;
    callerAvatar: FieldMapping;
  };
  handling?: {
    mode: 'native' | 'custom' | 'hybrid';
    enableCustomUI: boolean;
  };
  onIncomingCall: (callData: CallData) => void;
  onCallEnded: (callData: CallData) => void;
  onCallMissed: (callData: CallData) => void;
  notification?: NotificationConfig;
}

interface FCMTrigger {
  field: string;
  value: string;
}

interface FieldMapping {
  field: string;
  fallback: any;
}
```

## Contributing

See the [contributing guide](CONTRIBUTING.md) to learn how to contribute to the repository and the development workflow.

## License

MIT

---

Made with ❤️ by [bear-block](https://github.com/bear-block)
