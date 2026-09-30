declare module 'react-native' {
  export interface TurboModule {}
  export const TurboModuleRegistry: {
    get<T extends TurboModule>(name: string): T | null;
    getEnforcing<T extends TurboModule>(name: string): T;
  };
  export const NativeModules: Record<string, unknown>;
  export class NativeEventEmitter {
    constructor(module?: unknown);
    addListener(name: string, listener: (value: unknown) => void): {remove(): void};
  }
}
