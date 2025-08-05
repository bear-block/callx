import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface CallData {
  callId: string;
  callerName: string;
  callerPhone: string;
  callerAvatar?: string;
  hasVideo?: boolean;
  endReason?:
    | 'answered_elsewhere'
    | 'timeout'
    | 'cancelled'
    | 'busy'
    | 'rejected'
    | 'declined'
    | 'missed'
    | 'ended'
    | 'unknown';
  answeredBy?: string;
  deviceType?: string;
  duration?: number;
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
  // Field mappings for FCM data extraction
  fieldMapping?: Record<string, { path: string; fallback?: string }>;

  // Trigger configurations
  triggers?: Record<string, { field: string; value: string }>;

  // Event listeners
  onIncomingCall?: CallEventListener;
  onCallAnswered?: CallEventListener;
  onCallDeclined?: CallEventListener;
  onCallEnded?: CallEventListener;
  onCallMissed?: CallEventListener;
  onCallAnsweredElsewhere?: CallEventListener;
  onCallTimeout?: CallEventListener;
  onCallCancelled?: CallEventListener;
  onCallBusy?: CallEventListener;
  onCallRejected?: CallEventListener;
  onVoIPTokenUpdated?: TokenEventListener;
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
  handleFcmMessage(data: any): Promise<void>;

  // Lock screen management (Android)
  hideFromLockScreen(): Promise<boolean>;
  moveAppToBackground(): Promise<boolean>;

  // Call control methods
  muteCall(callId: string): Promise<void>;
  unmuteCall(callId: string): Promise<void>;
  isMuted(callId: string): Promise<boolean>;
  setSpeakerMode(callId: string, enabled: boolean): Promise<void>;
  isSpeakerMode(callId: string): Promise<boolean>;
  sendDTMF(callId: string, digit: string): Promise<void>;
  sendDTMFSequence(callId: string, sequence: string): Promise<void>;

  // Call state methods
  getCallState(callId: string): Promise<CallState>;
  getCallDuration(callId: string): Promise<number>;

  // Configuration debug
  getConfiguration(): Promise<any>;
}

// NEW: Call State Interface
export interface CallState {
  callId: string;
  isMuted: boolean;
  isSpeakerMode: boolean;
  isOnHold: boolean;
  isRecording: boolean;
  duration: number;
  audioRoute: 'speaker' | 'earpiece' | 'bluetooth' | 'headset';
  callQuality: 'excellent' | 'good' | 'fair' | 'poor';
}

export type CallEventListener = (callData: CallData) => void;
export type TokenEventListener = (tokenData: { token: string }) => void;

export default TurboModuleRegistry.getEnforcing<Spec>('Callx');
