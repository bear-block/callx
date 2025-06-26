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
4. **Test different scenarios:**
   - Data-only messages
   - Messages with notifications
   - Broadcast to multiple devices

## 🎯 Features

- ✅ **Device Registration** - Register FCM tokens from RN app
- ✅ **Call Controls** - Start/end calls with custom data
- ✅ **Broadcast** - Send calls to all registered devices
- ✅ **Real-time Status** - Active calls and device count
- ✅ **Clean UI** - Modern web interface for easy testing

## 🔍 Debugging

If calls don't appear:
1. Check React Native app is running (foreground/background)
2. Verify FCM token is correct (copy fresh from app)
3. Check Android logs: `adb logcat | grep -E "(FCM|Callx)"`
4. Ensure Firebase service account is configured

## 📊 API Endpoints

- `GET /api/status` - Server status
- `POST /api/register` - Register FCM token
- `POST /api/call/start` - Start call
- `POST /api/call/end` - End call
- `POST /api/broadcast` - Broadcast to all devices 