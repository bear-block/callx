# Callx Expo Plugin

Expo plugin for @bear-block/callx React Native library.

## Installation

```bash
npx expo install @bear-block/callx
```

## Configuration

Add the plugin to your `app.json` or `app.config.js`:

### Default (Native Mode)

```json
{
  "expo": {
    "plugins": ["@bear-block/callx"]
  }
}
```

### With Options

```json
{
  "expo": {
    "plugins": [
      [
        "@bear-block/callx",
        {
          "mode": "native",
          "package": "com.your.app.package"
        }
      ]
    ]
  }
}
```

## Plugin Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `mode` | `'native' \| 'js'` | `'native'` | Plugin operation mode |
| `package` | `string` | **Required** | Your Android package name (e.g., `com.your.app.package`) |

## Modes

### Native Mode (`mode: "native"`)

**Default mode.** Provides full native integration:

- ✅ **Android:** Adds `CallxFirebaseMessagingService` to AndroidManifest.xml
- ✅ **Android:** Modifies MainActivity to extend `CallxReactActivity` *(always applied)*
- ✅ **iOS:** Configures Info.plist for VoIP and background modes
- ✅ **Both:** Copies callx.json assets to native projects

**Use this mode when you want:**
- Automatic background FCM handling
- Native incoming call UI over lockscreen
- Full CallKit integration on iOS
- Automatic lockscreen management

### JS Mode (`mode: "js"`)

**JavaScript-controlled mode.** Selective native integration:

- ❌ **Android:** Does NOT add FCM service (you handle FCM in JS)
- ✅ **Android:** STILL modifies MainActivity to extend `CallxReactActivity` *(always required)*
- ✅ **iOS:** Still configures Info.plist for VoIP
- ✅ **Both:** Copies callx.json assets

**Use this mode when you want:**
- Handle FCM messages manually in JavaScript
- Control when/how to show incoming calls
- Custom FCM message processing logic
- Manual call flow management

> **Note:** MainActivity modification is **always applied** regardless of mode because `CallxReactActivity` is required for core lockscreen functionality.

## What the Plugin Does

### Android

**Native Mode:**
1. **MainActivity Modification**: Automatically changes `MainActivity` to extend `CallxReactActivity` instead of `ReactActivity`
2. **FCM Service**: Adds `CallxFirebaseMessagingService` to AndroidManifest.xml for background message handling
3. **Assets**: Copies `callx.json` configuration to `android/app/src/main/assets/`

**JS Mode:**
1. **MainActivity Modification**: STILL automatically changes `MainActivity` to extend `CallxReactActivity` (always required)
2. **FCM Service**: NOT added (you handle FCM in JavaScript)
3. **Assets**: Still copies `callx.json` configuration

### iOS

**Both Modes:**
1. **Info.plist**: Adds VoIP and background processing capabilities
2. **Assets**: Copies `callx.json` configuration to iOS bundle

## Package Configuration

The plugin requires you to specify your Android package name via the `package` option:

```javascript
withCallx({
  package: 'com.your.app.package' // Required: Your actual Android package name
})
```

This package name is used to:
- Locate your `MainActivity.kt` file in the correct directory structure
- Ensure the plugin modifies the right MainActivity file
- Support projects with custom directory structures

**MainActivity Search Strategy:**

1. **Primary Search**: Look in expected package paths:
   - `android/app/src/main/java/{package-path}/MainActivity.kt`
   - `android/app/src/main/kotlin/{package-path}/MainActivity.kt`

2. **Fallback**: If not found, the plugin will skip MainActivity modification and log a warning.

This approach is simpler and more predictable than complex directory scanning.

## Requirements

- Expo SDK 49+
- React Native 0.72+
- Android: API level 21+
- iOS: iOS 12+

## Troubleshooting

### MainActivity Not Found

If you see "MainActivity not found", ensure:
1. Your `expo.android.package` is correctly set in app.json
2. You've run `npx expo prebuild` to generate native code
3. MainActivity exists in the correct package directory

### FCM Service Not Working

If background FCM isn't working:
1. Ensure you're using `mode: "native"`
2. Check AndroidManifest.xml contains `CallxFirebaseMessagingService`
3. Verify Firebase configuration is correct

### Plugin Not Running

If plugin changes aren't applied:
1. Delete `android/` and `ios/` directories
2. Run `npx expo prebuild --clean`
3. Check plugin is listed in app.json

## Example Configuration

```json
{
  "expo": {
    "name": "My Callx App",
    "slug": "my-callx-app",
    "android": {
      "package": "com.mycompany.mycallxapp"
    },
    "ios": {
      "bundleIdentifier": "com.mycompany.mycallxapp"
    },
    "plugins": [
      [
        "@bear-block/callx",
        {
          "mode": "native",
          "fallbackPackage": "com.mycompany.mycallxapp"
        }
      ]
    ]
  }
}
```

## Support

For issues and support, please visit: https://github.com/bear-block/callx
