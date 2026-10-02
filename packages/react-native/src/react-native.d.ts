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
  export const View: import('react').ComponentType<ViewProps>;
  export const SafeAreaView: typeof View;
  export const Text: import('react').ComponentType<{children?: import('react').ReactNode; style?: unknown; accessibilityRole?: string; numberOfLines?: number}>;
  export const Pressable: import('react').ComponentType<ViewProps & {onPress: () => void; accessibilityRole?: string}>;
  export const StyleSheet: {absoluteFill: Record<string, string | number>; create<T>(styles: T): T};
  export const BackHandler: {addEventListener(name: string, listener: () => boolean): {remove(): void}};
  export interface ViewProps {
    children?: import('react').ReactNode;
    accessibilityLabel?: string;
    accessibilityRole?: string;
    accessibilityElementsHidden?: boolean;
    importantForAccessibility?: string;
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
