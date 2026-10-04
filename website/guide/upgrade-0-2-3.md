---
title: "Upgrade to 0.2.3"
description: "Dependency, UI behavior and safe-area migration from Callx 0.2.2 to 0.2.3."
---

# Upgrade from 0.2.2 to 0.2.3

Upgrade core and adapters together. See the [0.2.3 release notes](/project/changelog#release-0-2-3).

## Update packages together

```sh
npm install @bear-block/callx@0.2.3 @bear-block/callx-livekit@0.2.3
# Optional local development tooling:
npm install --save-dev @bear-block/callx-testkit@0.2.3
```

```yaml
dependencies:
  callx: ^0.2.3
  callx_livekit: ^0.2.3
```

Keep only the media adapter you use. Flutter hosts run `flutter pub get`; RN hosts regenerate
or update their native projects and iOS Pods after changing native dependencies. Expo Go
cannot load these native modules; rebuild your development app.

## Review supplied-screen behavior

Connected video controls now hide after five idle seconds. Foreground return restores them;
the first touch on hidden chrome reveals it without invoking a button. Voice, held/reconnecting
calls, errors and screen readers keep controls visible. To retain always-visible controls:

```tsx
// Inside your existing React Native call-screen composition:
<CallxCallScreen {...screenProps} autoHideControls={false} />
```

```dart
// Add this argument to your existing CallxCallScreen:
autoHideControls: false,
```

These fragments assume your existing screen properties and imports. See [Call UI](/guide/call-ui)
for complete composition. `controlsPinned` keeps controls visible for host dialogs or commands;
`controlsTimeoutMs` (TS) or `controlsTimeout` (Dart) changes the idle timeout.

The preview anchors near the top safe area independently of the header. Use `previewAlignment`/`previewSize` in Flutter or `previewPosition`/`previewStyle` in RN
for preview customization when composing your own layout. `CallxCallControl` defaults to 58dp;
`size` overrides its diameter. `leadingControls` supplies top-left actions and `endControl`
provides a separate End slot. Custom controls retain their own dimensions and behavior.

## Apply real device insets

Flutter uses SafeArea. RN hosts may supply `contentInsets` from their safe-area solution;
the example uses `react-native-safe-area-context` within SafeAreaProvider. That dependency
belongs to the example and is not required by the core SDK. Install and rebuild it if you
copy the example pattern; on iOS update Pods as well. Fixed top padding is not a substitute
for device insets. Test portrait, landscape, large text and system-bar/cutout configurations.

## Android locked-call presentation

Under RequireUnlock, Answer keeps the native timer and controls visible. Open app requests
unlocking before revealing the framework screen. The camera stays off until explicitly enabled.
No backend payload migration is needed. Native labels can be customized from Kotlin through
CallNotificationLabels; unified Dart/TypeScript configuration remains planned.

The examples minimize to the in-app mini-call on Back and enter system PiP automatically
when leaving a live video call on supported Android 12+ hosts. This is example configuration,
not a mandatory setting for your app. iOS system PiP remains unsupported.

## Preserve call ownership

Contract 0.2.0 and media adapter API 2 remain unchanged. UI observes native snapshots and sends
commands; it must not create a second call owner or join media again on expand/unlock.
The example names and local signaling harness are not production authentication or signaling.

Verify push, locked answer, camera consent, background/foreground, terminal cleanup and audio
routing on your target devices. [Status](/project/status) distinguishes automated and emulator
results from pending physical-device acceptance.
