// Only what this package uses; the app supplies react-native at runtime.
declare module 'react-native' {
  export const NativeModules: Record<string, unknown>;
}
