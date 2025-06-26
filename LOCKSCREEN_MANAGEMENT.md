# 🔒 Lock Screen Management in Callx

## **Why Lock Screen Management is Needed?**

When the app shows **over lock screen** to answer calls, after the call ends the app may still be **accessible over lock screen**. This is **not secure** because users don't want the app visible on lock screen when there's no active call.

## **New Methods:**

### 1. **`hideFromLockScreen()`**

```typescript
await CallxInstance.hideFromLockScreen();
```

**Functions:**

- ✅ Remove `FLAG_SHOW_WHEN_LOCKED` from activity
- ✅ Disable `FLAG_TURN_SCREEN_ON` and `FLAG_KEEP_SCREEN_ON`
- ✅ Automatically move app to background
- ✅ Security best practice after call ends

### 2. **`moveAppToBackground()`**

```typescript
await CallxInstance.moveAppToBackground();
```

**Functions:**

- ✅ Simulate **Home button** press
- ✅ Move app to background immediately
- ✅ User returns to Home screen or launcher

## **When to Use?**

### **Scenario 1: Call Ended**

```typescript
const handleCallEnded = async (callData) => {
  console.log('📵 Call ended:', callData);

  // Immediately hide app from lock screen
  await CallxInstance.hideFromLockScreen();

  // App will go back under lock screen
  Alert.alert('Call Ended', 'Call has ended');
};
```

### **Scenario 2: User Declines Call**

```typescript
const handleCallDeclined = async (callData) => {
  console.log('❌ Call declined:', callData);

  // Hide from lock screen after decline
  await CallxInstance.hideFromLockScreen();
};
```

### **Scenario 3: High Security Mode**

```typescript
const handleCallAnswered = async (callData) => {
  console.log('✅ Call answered');

  // Even when answered, still hide from lock screen
  // User will need to unlock to interact with app
  await CallxInstance.hideFromLockScreen();
};
```

## **🔐 4 Security Mode Combinations:**

| `showOverLockscreen` | `requireUnlock` | **Mode**             | **Behavior**                                  |
| -------------------- | --------------- | -------------------- | --------------------------------------------- |
| `true`               | `true`          | **🔐 HIGH SECURITY** | Show over lock but require unlock to interact |
| `true`               | `false`         | **🔓 STANDARD**      | Show over lock, allow immediate interaction   |
| `false`              | `true`          | **🔒 SECURE**        | Don't show over lock, require unlock first    |
| `false`              | `false`         | **📱 MINIMAL**       | Standard behavior                             |

### **🔐 HIGH SECURITY MODE** _(Most Secure Option)_

```json
{
  "app": {
    "showOverLockscreen": true, // ✅ Show call info
    "requireUnlock": true // 🔒 But need unlock to answer/decline
  }
}
```

**Detailed Flow:**

1. **📞 Call arrives** → App shows over lock screen with caller info
2. **👀 User sees** caller name, phone number, avatar
3. **👆 User taps Answer** → System prompts: "Unlock to answer call"
4. **🔓 User unlocks** device (fingerprint/PIN/pattern/face)
5. **✅ Call answered** → Full app interaction available
6. **📵 Call ends** → App auto-hides from lock screen

**Perfect for:**

- **🏦 Banking apps** - See caller but secure interaction
- **🏥 Healthcare** - HIPAA compliance with visibility
- **🏢 Corporate** - Security policy compliant
- **👤 Personal** - Family can see calls but strangers can't answer

**Benefits:**

- **🛡️ Security**: Unauthorized users can't answer calls
- **👀 Visibility**: Legitimate users can see who's calling
- **⚡ Quick ID**: Fast caller identification without full unlock
- **🔐 Best of both worlds**: Security + Usability

## **Configuration in callx.json:**

```json
{
  "app": {
    "showOverLockscreen": true,
    "requireUnlock": false,
    "autoHideAfterCall": true
  }
}
```

**Configuration Options:**

- `showOverLockscreen`: Allow app to show over lock screen
- `requireUnlock`: Require unlock before interaction
- `autoHideAfterCall`: Auto-hide after call ends (future feature)

## **Complete Usage Example:**

```typescript
import CallxInstance from 'callx';

// Setup event listeners
await CallxInstance.initialize({
  onIncomingCall: (callData) => {
    console.log('📞 Call incoming - app will show over lock screen');
  },

  onCallAnswered: (callData) => {
    console.log('✅ Call answered');
    // Don't hide immediately - let user interact with app
  },

  onCallEnded: async (callData) => {
    console.log('📵 Call ended - hiding from lock screen');

    // IMPORTANT: Hide immediately
    await CallxInstance.hideFromLockScreen();

    console.log('🔒 App hidden - user needs unlock to access');
  },

  onCallDeclined: async (callData) => {
    console.log('❌ Call declined - hiding from lock screen');

    // Hide after decline
    await CallxInstance.hideFromLockScreen();
  },
});
```

## **Security Benefits:**

### **🔒 Privacy Protection:**

- App not accessible over lock screen after call
- Prevent unauthorized access when device locked
- Follow **security best practices**

### **🛡️ Enterprise Ready:**

- Suitable for banking, healthcare apps
- Configurable security levels
- Audit-friendly behavior

### **📱 UX Improvement:**

- Clean lock screen after call
- No user confusion
- Consistent with system behavior

## **Native Implementation:**

### **Android:**

```kotlin
// Clear lock screen flags
currentActivity.setShowWhenLocked(false)
currentActivity.setTurnScreenOn(false)
currentActivity.window.clearFlags(
  WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
  WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
)

// Move to background
val homeIntent = Intent(Intent.ACTION_MAIN).apply {
  addCategory(Intent.CATEGORY_HOME)
  flags = Intent.FLAG_ACTIVITY_NEW_TASK
}
context.startActivity(homeIntent)
```

## **Testing:**

1. **Test with locked device:**

   ```bash
   # Lock device
   adb shell input keyevent KEYCODE_POWER

   # Send FCM to trigger call
   # Answer call -> app shows over lock screen
   # End call -> app should hide automatically
   ```

2. **Verify behavior:**
   - ✅ App hides from lock screen
   - ✅ Screen returns to lock screen
   - ✅ App accessible after unlock

## **Troubleshooting:**

### **App still shows over lock screen:**

- Check if `hideFromLockScreen()` is called
- Verify activity is currently active
- Check logs for debugging

### **Method doesn't work:**

- Ensure Android API level support
- Check permissions in manifest
- Verify current activity is available

## **Best Practices:**

1. **Always hide after call ended/declined**
2. **Call immediately** - don't delay
3. **Combine with move to background** for best UX
4. **Test on real device** - emulator may behave differently
5. **Add logging** for debugging if issues occur

## **API Reference:**

### **hideFromLockScreen()**

```typescript
await CallxInstance.hideFromLockScreen(): Promise<boolean>
```

- **Returns**: `true` if successful, `false` if failed
- **Purpose**: Remove app from lock screen and move to background
- **When to use**: After call ends, declined, or for security

### **moveAppToBackground()**

```typescript
await CallxInstance.moveAppToBackground(): Promise<boolean>
```

- **Returns**: `true` if successful, `false` if failed
- **Purpose**: Move app to background (simulate home button)
- **When to use**: When you need to minimize app without lock screen changes

---

**✨ Result:** Better app security, cleaner UX, enterprise-ready! 🚀
