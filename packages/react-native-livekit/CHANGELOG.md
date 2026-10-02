# Changelog

## 0.1.3

- Released with core 0.1.3, which fixes ringing on Android 10–12. No adapter changes.

## 0.1.1

- Republished with `@bear-block/callx` 0.1.1, the first version of the core on npm. No code changes.

## 0.1.0

- First public release. See the [package ecosystem decision](https://bear-block.github.io/callx/project/decisions).
- iOS: import `NativeModules` by name; a namespace import of `react-native` threw while
  evaluating `PushNotificationIOS`.
