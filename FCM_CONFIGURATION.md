# FCM Configuration Guide

This document explains how to configure Firebase Cloud Messaging (FCM) for the Callx library.

## FCM Data Structure

### Basic Structure

The Callx library expects FCM messages with a specific data structure:

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

### Advanced Structure

For more complex applications, you can use nested structures:

```json
{
  "data": {
    "callStatus": "incoming",
    "call": {
      "id": "call-123",
      "timestamp": "2024-01-01T12:00:00Z",
      "caller": {
        "name": "John Doe",
        "phone": "+1234567890",
        "avatar": "https://example.com/avatar.jpg",
        "userId": "user-123"
      },
      "metadata": {
        "roomId": "room-456",
        "callType": "video",
        "duration": 0
      }
    }
  },
  "notification": {
    "title": "Incoming Call",
    "body": "John Doe is calling..."
  }
}
```

### With Missing Fields

The library supports fallback values when fields are missing:

```json
{
  "data": {
    "type": "call.started",
    "callId": "call-123"
    // callerName and callerPhone are missing, will use fallback values
  }
}
```

## Call States

### 1. Incoming Call

Triggered when a new call arrives:

```json
{
  "data": {
    "type": "call.started"
  }
}
```

### 2. Call Ended

Triggered when a call ends normally:

```json
{
  "data": {
    "type": "call.ended"
  }
}
```

### 3. Call Missed

Triggered when a call is missed:

```json
{
  "data": {
    "type": "call.missed"
  }
}
```

## Configuration Mapping

### Field Syntax

The library uses dot notation to access FCM data fields:

| Field | Description | Example |
|-------|-------------|---------|
| `data.type` | Access `data.type` field | `"call.started"` |
| `data.callStatus` | Access `data.callStatus` field | `"incoming"` |
| `data.call.id` | Access nested `data.call.id` field | `"call-123"` |

### Custom Configuration

You can customize the mapping in your app configuration:

```javascript
// React Native CLI
const config = {
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
  }
};
```

```json
// Expo
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
            }
          }
        }
      ]
    ]
  }
}
```

## Field Mapping Examples

### Basic Field Mapping

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

### Nested Field Mapping

```javascript
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
}
```

### Custom Field Names

```javascript
fields: {
  callId: {
    field: 'data.callId',
    fallback: 'unknown-call'
  },
  callerName: {
    field: 'data.senderName',
    fallback: 'Unknown Caller'
  },
  callerPhone: {
    field: 'data.senderPhone',
    fallback: 'No Number'
  },
  callerAvatar: {
    field: 'data.senderAvatar',
    fallback: null
  }
}
```

## Sending FCM Messages

### Using Firebase Admin SDK

```javascript
const admin = require('firebase-admin');

const message = {
  data: {
    type: 'call.started',
    callId: 'call-123',
    callerName: 'John Doe',
    callerPhone: '+1234567890',
    callerAvatar: 'https://example.com/avatar.jpg'
  },
  notification: {
    title: 'Incoming Call',
    body: 'John Doe is calling...'
  },
  token: 'DEVICE_FCM_TOKEN'
};

admin.messaging().send(message);
```

### Using cURL

```bash
curl -X POST -H "Authorization: key=YOUR_SERVER_KEY" \
     -H "Content-Type: application/json" \
     -d '{
       "to": "DEVICE_FCM_TOKEN",
       "data": {
         "type": "call.started",
         "callId": "call-123",
         "callerName": "John Doe",
         "callerPhone": "+1234567890"
       },
       "notification": {
         "title": "Incoming Call",
         "body": "John Doe is calling..."
       }
     }' \
     https://fcm.googleapis.com/fcm/send
```

### Using Postman

1. Set method to `POST`
2. URL: `https://fcm.googleapis.com/fcm/send`
3. Headers:
   - `Authorization: key=YOUR_SERVER_KEY`
   - `Content-Type: application/json`
4. Body (raw JSON):
```json
{
  "to": "DEVICE_FCM_TOKEN",
  "data": {
    "type": "call.started",
    "callId": "call-123",
    "callerName": "John Doe",
    "callerPhone": "+1234567890"
  },
  "notification": {
    "title": "Incoming Call",
    "body": "John Doe is calling..."
  }
}
```

## Testing Scenarios

### 1. Incoming Call Test

```json
{
  "data": {
    "type": "call.started",
    "callId": "test-incoming-123",
    "callerName": "Test User",
    "callerPhone": "+1234567890"
  }
}
```

### 2. Call Ended Test

```json
{
  "data": {
    "type": "call.ended",
    "callId": "test-ended-123",
    "callerName": "Test User",
    "callerPhone": "+1234567890"
  }
}
```

### 3. Call Missed Test

```json
{
  "data": {
    "type": "call.missed",
    "callId": "test-missed-123",
    "callerName": "Test User",
    "callerPhone": "+1234567890"
  }
}
```

### 4. Missing Fields Test

```json
{
  "data": {
    "type": "call.started",
    "callId": "test-missing-123"
    // callerName and callerPhone are missing, will use fallback values
  }
}
```

### 5. Nested Structure Test

```json
{
  "data": {
    "type": "call.started",
    "call": {
      "id": "test-nested-123",
      "caller": {
        "name": "Test User",
        "phone": "+1234567890",
        "avatar": "https://example.com/avatar.jpg"
      }
    }
  }
}
```

## Best Practices

### 1. Data Consistency

- Use consistent field names across all call states
- Include all required fields in every message
- Use unique call IDs for each call

### 2. Error Handling

- Always include fallback values for optional fields
- Validate FCM data structure on the server side
- Log FCM delivery status

### 3. Performance

- Keep data payload minimal
- Use efficient data types
- Avoid sending unnecessary fields

### 4. Security

- Validate FCM tokens on the server
- Use HTTPS for all communications
- Implement proper authentication

### 5. Field Mapping

- Use descriptive fallback values
- Test with missing fields
- Document your field mapping configuration

## Troubleshooting

### Common Issues

1. **Message not received:**
   - Check FCM token validity
   - Verify device internet connection
   - Check Firebase project configuration

2. **Wrong call state triggered:**
   - Verify data structure matches configuration
   - Check field and value mapping
   - Test with debug mode enabled

3. **Missing data fields:**
   - Ensure all required fields are included
   - Check field names match configuration
   - Validate JSON structure

4. **Fallback values not working:**
   - Verify field mapping configuration
   - Check field path syntax
   - Test with missing fields

### Debug Mode

Enable debug logging to troubleshoot FCM issues:

```javascript
import { Callx } from 'callx';

Callx.setDebugMode(true);
```

### Verification Steps

1. Check FCM token generation
2. Verify message delivery status
3. Monitor app logs for FCM events
4. Test with different data structures
5. Test with missing fields to verify fallbacks