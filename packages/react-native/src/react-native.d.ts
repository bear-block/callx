declare module 'react-native' {
  export const NativeModules: Record<string, unknown>;
  export class NativeEventEmitter {
    constructor(module?: unknown);
    addListener(name: string, listener: (value: unknown) => void): {remove(): void};
  }
}
