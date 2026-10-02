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
  /** In apps this resolves to React Native's own HostComponent type. */
  export interface HostComponent<Props> { readonly __props?: Props }
  export interface ViewProps {
    style?: unknown;
    testID?: string;
    pointerEvents?: 'box-none' | 'none' | 'box-only' | 'auto';
  }
}
declare module 'react-native/Libraries/Utilities/codegenNativeComponent' {
  import type {HostComponent} from 'react-native';
  export default function codegenNativeComponent<Props>(name: string): HostComponent<Props>;
}
declare module 'react-native/Libraries/Types/CodegenTypes' {
  export type WithDefault<Type, _Value> = Type | null | undefined;
}
