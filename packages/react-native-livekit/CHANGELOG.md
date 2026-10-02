# Changelog

## 0.2.2 — 2026-10-02

- Remote camera mute/unmute updates video availability and detaches the muted track from
  video views, allowing the host app to show local video or its branded fallback.
- Video: the adapter implements media adapter API 2. It publishes, switches and stops the camera,
  reports remote video and a camera paused in the background, and renders into `CallxVideoView`.
  The host declares the camera permission.

## 0.1.3

- Released with core 0.1.3, which fixes ringing on Android 10–12. No adapter changes.

## 0.1.1

- Republished with `@bear-block/callx` 0.1.1, the first version of the core on npm. No code changes.

## 0.1.0

- First public release. See the [package ecosystem decision](https://bear-block.github.io/callx/project/decisions).
- iOS: import `NativeModules` by name; a namespace import of `react-native` threw while
  evaluating `PushNotificationIOS`.
