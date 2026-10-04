// The Callx TurboModule spec. React Native's codegen reads this file (package.json
// codegenConfig) and generates the typed native interfaces on Android and iOS.
// The contract types live in ../index.ts; values cross the boundary as plain objects.
import type {TurboModule} from 'react-native';
import {TurboModuleRegistry} from 'react-native';

export interface Spec extends TurboModule {
  setup(config: Object): Promise<Object>;
  execute(command: Object): Promise<Object>;
  queryOperation(query: Object): Promise<Object>;
  openSession(request: Object): Promise<Object>;
  acknowledge(request: Object): Promise<void>;
  closeSession(request: Object): Promise<void>;
  getSnapshot(): Promise<Object>;
  getPushToken(): Promise<Object | null>;
  dispose(): void;
  // Picture-in-picture for video calls (ADR-0010 addendum), Android and iOS.
  configurePictureInPicture(options: Object): void;
  enterPictureInPicture(): Promise<boolean>;
  // Event subscription for NativeEventEmitter ("callxEvent").
  addListener(eventName: string): void;
  removeListeners(count: number): void;
}

export default TurboModuleRegistry.get<Spec>('Callx');
