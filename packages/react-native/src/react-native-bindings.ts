// The React Native bindings Callx uses, as named imports. Loading `import('react-native')` as a
// namespace makes Metro read every export, including PushNotificationIOS, whose
// NativeEventEmitter throws on iOS when its native module is absent. Named imports read only
// what is used. native.ts loads this module dynamically, so non-React Native hosts still get
// a nativeUnavailable error instead of a crash.
import {NativeEventEmitter, NativeModules, TurboModuleRegistry} from 'react-native';

export const bindings = {NativeEventEmitter, NativeModules, TurboModuleRegistry};
