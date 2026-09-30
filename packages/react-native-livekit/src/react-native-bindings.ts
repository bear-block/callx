// Named imports only: `import('react-native')` as a namespace makes Metro read every export,
// and PushNotificationIOS throws on iOS when its native module is absent. index.ts loads this
// module dynamically, so non-React Native hosts get an error instead of a crash.
import {NativeModules} from 'react-native';

export const bindings = {NativeModules};
