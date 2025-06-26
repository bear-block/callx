# 🔒 Lock Screen Management API Reference

Quick reference for Callx lock screen management methods.

## **Quick Start**

```typescript
import CallxInstance from 'callx';

// Hide app from lock screen after call ends
await CallxInstance.hideFromLockScreen();

// Move app to background
await CallxInstance.moveAppToBackground();
```

## **Methods**

### **`hideFromLockScreen()`**

```typescript
await CallxInstance.hideFromLockScreen(): Promise<boolean>
```

- **Purpose**: Remove app from lock screen and move to background
- **Returns**: `true` if successful, `false` if failed
- **Use case**: After call ends, declined, or for security

### **`moveAppToBackground()`**

```typescript
await CallxInstance.moveAppToBackground(): Promise<boolean>
```

- **Purpose**: Move app to background (simulate home button)
- **Returns**: `true` if successful, `false` if failed
- **Use case**: When you need to minimize app

## **Security Modes**

| Show Over Lock | Require Unlock | Mode              | Behavior                                        |
| -------------- | -------------- | ----------------- | ----------------------------------------------- |
| ✅             | ✅             | **HIGH SECURITY** | Show caller info but require unlock to interact |
| ✅             | ❌             | **STANDARD**      | Show over lock, allow immediate interaction     |
| ❌             | ✅             | **SECURE**        | Don't show over lock, require unlock first      |
| ❌             | ❌             | **MINIMAL**       | Standard behavior                               |

## **Configuration**

```json
{
  "app": {
    "showOverLockscreen": true,
    "requireUnlock": false
  }
}
```

## **Usage Examples**

### **Call End Handler**

```typescript
onCallEnded: async (callData) => {
  await CallxInstance.hideFromLockScreen();
  console.log('App hidden from lock screen');
};
```

### **High Security Mode**

```typescript
onCallAnswered: async (callData) => {
  // Even after answering, hide from lock screen for security
  await CallxInstance.hideFromLockScreen();
};
```

### **Background Move**

```typescript
// Just minimize app without lock screen changes
await CallxInstance.moveAppToBackground();
```

## **Best Practices**

1. ✅ **Always call** after call ends/declines
2. ✅ **Call immediately** - don't delay
3. ✅ **Test on real device** - emulator may differ
4. ✅ **Add error handling** for robust behavior
5. ✅ **Log for debugging** if issues occur

## **Error Handling**

```typescript
try {
  const success = await CallxInstance.hideFromLockScreen();
  if (!success) {
    console.warn('Failed to hide from lock screen');
  }
} catch (error) {
  console.error('Lock screen management error:', error);
}
```

## **Platform Support**

- **Android**: Full support ✅
- **iOS**: Coming soon 🚧

---

**💡 Pro Tip**: Use `hideFromLockScreen()` for security-critical apps, `moveAppToBackground()` for general use cases.
