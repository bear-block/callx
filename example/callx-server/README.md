# 📞 Callx Server

Web UI for testing Callx FCM calls during development.

## 🚀 Quick Start

### From main project:

```bash
yarn server
```

### Or directly:

```bash
cd example/callx-server
npm start
```

## 🔧 Setup

1. **Add Firebase service account:**

   ```bash
   # Download from Firebase Console > Project Settings > Service Accounts
   # Save as: firebase-service-account.json
   ```

2. **Open web UI:**
   ```
   http://localhost:3001
   ```

## 📱 Usage

1. **Launch React Native app** and copy FCM token
2. **Register device** in web UI
3. **Start calls** from web interface
4. **Manage multiple calls:**
   - View calls grouped by device
   - Queue position tracking (#1, #2, etc.)
   - Priority levels (Normal 🔵, High 🟡, Urgent 🔴)
   - End individual calls or mark as missed
   - End all calls at once
5. **Test multiple call scenarios:**
   - Single device with multiple calls (up to 5)
   - Call queue management and position updates
   - Priority-based calling
   - Auto-expire behavior (60s timeout per call)
   - Quick bulk test buttons (2, 3, 5 calls)
6. **Advanced features:**
   - Data-only messages
   - Messages with notifications
   - Broadcast to multiple devices
   - Device call limits and queue management

## 🎯 Features

- ✅ **Device Registration** - Register FCM tokens from RN app
- ✅ **Multiple Calls Support** - Queue up to 5 calls per device
- ✅ **Enhanced Call Controls** - Start/end/missed calls with complete data
- ✅ **Priority System** - Normal/High/Urgent call priorities
- ✅ **Device Grouping** - Organized view of calls per device
- ✅ **Queue Management** - Position tracking and automatic updates
- ✅ **Broadcast** - Send calls to all registered devices
- ✅ **Real-time Status** - Active calls with remaining time display
- ✅ **Auto-Expire** - Calls automatically marked as missed after 60s
- ✅ **Mass Operations** - End all active calls at once
- ✅ **Bulk Testing** - Quick buttons to start multiple calls
- ✅ **Settings Panel** - Configure call timeout duration
- ✅ **Clean UI** - Modern web interface for easy testing
- ✅ **Better Logging** - Enhanced server logs with call details

## 🔍 Debugging

If calls don't appear:

1. Check React Native app is running (foreground/background)
2. Verify FCM token is correct (copy fresh from app)
3. Check Android logs: `adb logcat | grep -E "(FCM|Callx)"`
4. Ensure Firebase service account is configured

## 📊 API Endpoints

- `GET /api/status` - Server status & configuration
- `POST /api/register` - Register FCM token
- `POST /api/call/start` - Start call with priority & queue position
- `POST /api/call/end` - End active call (updates queue)
- `POST /api/call/missed` - Mark call as missed (updates queue)
- `POST /api/calls/end-all` - End all active calls (clears all queues)
- `GET /api/calls` - Get active calls grouped by device
- `GET /api/calls/device/:token` - Get calls for specific device
- `POST /api/broadcast` - Broadcast to all devices with priority
- `POST /api/test-notification` - Send basic FCM notification
- `POST /api/test-data-only` - Send data-only FCM message

## 📞 Multiple Calls FCM Data

### **Start Call with Queue Info:**

```json
{
  "type": "call.started",
  "callId": "call-1234567890-abc12",
  "callerName": "John Doe #2",
  "callerPhone": "+84123456789",
  "callerAvatar": "https://picsum.photos/200/200",
  "priority": "high",
  "queuePosition": 2,
  "totalCalls": 2
}
```

### **Queue Update Notification:**

```json
{
  "type": "call.queue_updated",
  "callId": "call-1234567890-abc12",
  "newPosition": 1,
  "totalCalls": 1,
  "message": "You are now first in queue"
}
```

### **Multiple Call Management:**

- **Device Limit**: Max 5 calls per device
- **Queue Order**: FIFO (First In, First Out)
- **Position Updates**: Automatic when calls end
- **Priority Display**: 🔵 Normal, 🟡 High, 🔴 Urgent
