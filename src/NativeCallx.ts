import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface CallData {
  callId: string;
  callerName: string;
  callerPhone: string;
  callerAvatar?: string;
  timestamp?: number;
}

export interface TriggerConfigData {
  field: string;
  value: string;
}

export interface FieldConfigData {
  field: string;
  fallback?: string;
}

export interface NotificationConfigData {
  channelId?: string;
  channelName?: string;
  channelDescription?: string;
  importance?: string;
  sound?: string;
}

export interface CallxConfig {
  // NOTE: All configuration fields are optional
  // They can be pre-configured via callx.json at build time
  triggers?: {
    incoming?: TriggerConfigData;
    ended?: TriggerConfigData;
    missed?: TriggerConfigData;
  };
  fields?: {
    callId?: FieldConfigData;
    callerName?: FieldConfigData;
    callerPhone?: FieldConfigData;
    callerAvatar?: FieldConfigData;
  };
  notification?: NotificationConfigData;
}

export interface Spec extends TurboModule {
  // Configuration
  initialize(config: CallxConfig): Promise<void>;

  // Call management
  showIncomingCall(callData: CallData): Promise<void>;
  endCall(callId: string): Promise<void>;
  answerCall(callId: string): Promise<void>;
  declineCall(callId: string): Promise<void>;

  // FCM handling - using simpler Object type instead of Record
  handleFcmMessage(data: Object): Promise<void>;

  // Configuration methods
  setFieldMapping(
    field: string,
    path: string,
    fallback?: string
  ): Promise<void>;
  setTrigger(trigger: string, field: string, value: string): Promise<void>;

  // Status methods
  getCurrentCall(): Promise<CallData | null>;
  isCallActive(): Promise<boolean>;

  // Legacy multiply method (for testing)
  multiply(a: number, b: number): number;
}

export default TurboModuleRegistry.getEnforcing<Spec>('Callx');
