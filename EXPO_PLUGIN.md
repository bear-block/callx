# Callx Expo Plugin Configuration

This document provides detailed instructions for configuring the Callx library with Expo.

## Installation

```sh
npx expo install callx
```

## Plugin Configuration

### Basic Configuration

Add the plugin to your `app.json`:

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
            }
          }
        }
      ]
    ]
  }
}
```

### Advanced Configuration

For more complex FCM data structures, you can customize the field and values:

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
                "field": "data.callStatus",
                "value": "incoming"
              },
              "ended": {
                "field": "data.callStatus",
                "value": "completed"
              },
              "missed": {
                "field": "data.callStatus",
                "value": "missed"
              }
            },
            "fields": {
              "callId": {
                "field": "data.call.id",
                "fallback": "unknown-call"
              },
              "callerName": {
                "field": "data.caller.name",
                "fallback": "Unknown Caller"
              },
              "callerPhone": {
                "field": "data.caller.phone",
                "fallback": "No Number"
              },
              "callerAvatar": {
                "field": "data.caller.avatar",
                "fallback": null
              }
            },
            "notification": {
              "channelId": "callx_custom_calls",
              "channelName": "Custom Call Notifications",
              "channelDescription": "Custom notifications for incoming calls",
              "importance": "max",
              "sound": "custom_sound"
            }
          }
        }
      ]
    ]
  }
}
```

### Configuration with app.config.js

If you prefer using `app.config.js`:

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
            }
          }
        }
      ]
    ]
  }
};
```

## Configuration Options

### Field Syntax

The `field` option uses dot notation to access FCM data fields:

- `data.type` - Access `data.type` field
- `data.call.id` - Access nested `data.call.id` field
- `data.callStatus` - Access `data.callStatus` field

### Supported Call States

| State | Description | Trigger |
|-------|-------------|---------|
| `incoming` | New incoming call | FCM data matches incoming configuration |
| `ended` | Call ended normally | FCM data matches ended configuration |
| `missed` | Call was missed | FCM data matches missed configuration |

### Field Mapping Configuration

| Field | Type | Description | Default |
|-------|------|-------------|---------|
| `field` | string | Field path in FCM data | `data.callId` |
| `fallback` | any | Fallback value when field is missing | `null` |

### Notification Configuration

| Option | Type | Description | Default |
|--------|------|-------------|---------|
| `channelId` | string | Unique notification channel ID | `callx_incoming_calls` |
| `channelName` | string | Channel name shown to users | `Incoming Calls` |
| `channelDescription` | string | Channel description | `Notifications for incoming calls` |
| `importance` | string | Notification importance level | `high` |
| `sound` | string | Notification sound | `default` |

### Example FCM Payloads

#### Basic Structure
```json
{
  "data": {
    "type": "call.started",
    "callId": "call-123",
    "callerName": "John Doe",
    "callerPhone": "+1234567890"
  }
}
```

#### Advanced Structure
```json
{
  "data": {
    "callStatus": "incoming",
    "call": {
      "id": "call-123",
      "caller": {
        "name": "John Doe",
        "phone": "+1234567890",
        "avatar": "https://example.com/avatar.jpg"
      }
    }
  }
}
```

#### With Missing Fields
```json
{
  "data": {
    "type": "call.started",
    "callId": "call-123"
    // callerName and callerPhone are missing, will use fallback values
  }
}
```

## Build Process

### Development Build

```sh
npx expo run:android
```

### Production Build

```sh
eas build --platform android
```

### Custom Development Build

```sh
npx expo prebuild
npx expo run:android
```

## Troubleshooting

### Common Issues

1. **Plugin not found:**
   ```sh
   npx expo install callx
   npx expo prebuild --clean
   ```

2. **Configuration not applied:**
   - Ensure plugin is in the correct format
   - Check for syntax errors in JSON/JS
   - Run `npx expo prebuild --clean`

3. **Build errors:**
   - Check Expo SDK compatibility
   - Ensure all dependencies are installed
   - Clear build cache: `npx expo prebuild --clean`

### Debug Configuration

Enable debug mode in your app:

```javascript
import { Callx } from 'callx';

Callx.setDebugMode(true);
```

### Verification

To verify the plugin is working:

1. Check the generated Android files in `android/app/src/main/java/`
2. Look for Callx-related classes and configurations
3. Test with FCM messages using the configured data structure

## Migration from React Native CLI

If migrating from React Native CLI to Expo:

1. Remove manual Android configurations
2. Add the plugin to `app.json` or `app.config.js`
3. Run `npx expo prebuild --clean`
4. Test the integration

## Support

For issues specific to Expo integration:

1. Check the [Expo documentation](https://docs.expo.dev/)
2. Verify plugin configuration syntax
3. Test with minimal configuration first
4. Check Expo SDK compatibility 