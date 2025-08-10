import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface CallData {
  callId: string;
  callerName: string;
  callerPhone: string;
  callerAvatar?: string;
  hasVideo?: boolean;
  endReason?: 'answered_elsewhere' | 'missed' | 'ended' | 'unknown';
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

export interface FieldMappingConfig {
  path: string;
  fallback?: string;
}

export interface TriggerConfigEntry {
  field: string;
  value: string;
}

export interface CallxConfig {
  // Field mappings for FCM data extraction
  fieldMapping?: { [key: string]: FieldMappingConfig };

  // Trigger configurations
  triggers?: { [key: string]: TriggerConfigEntry };
}

export interface Spec extends TurboModule {
  // Core methods
  initialize(config: CallxConfig): Promise<void>;
  showIncomingCall(callData: CallData): Promise<void>;
  // Call management methods
  endCall(callId: string): Promise<void>;
  answerCall(callId: string): Promise<void>;
  declineCall(callId: string): Promise<void>;

  // Token management
  getFCMToken(): Promise<string>;
  getVoIPToken(): Promise<string>;

  // Configuration
  setFieldMapping(
    field: string,
    path: string,
    fallback?: string
  ): Promise<void>;
  setTrigger(trigger: string, field: string, value: string): Promise<void>;

  // Status and state
  getCurrentCall(): Promise<CallData | null>;
  isCallActive(): Promise<boolean>;

  // FCM handling
  handleFcmMessage(data: { [key: string]: string }): Promise<void>;

  // Lock screen management (Android)
  hideFromLockScreen(): Promise<boolean>;
  moveAppToBackground(): Promise<boolean>;

  // Configuration debug
  getConfiguration(): Promise<any>;
}

export type CallEventListener = (callData: CallData) => void;
export type TokenEventListener = (tokenData: { token: string }) => void;

export default TurboModuleRegistry.getEnforcing<Spec>('Callx');
