import Callx from './NativeCallx';
import type { CallData, CallxConfig } from './NativeCallx';

// Export types
export type { CallData, CallxConfig };

// Event listeners
type CallEventListener = (callData: CallData) => void;

interface CallEventListeners {
  onIncomingCall?: CallEventListener;
  onCallEnded?: CallEventListener;
  onCallMissed?: CallEventListener;
  onCallAnswered?: CallEventListener;
  onCallDeclined?: CallEventListener;
}

class CallxManager {
  private listeners: CallEventListeners = {};

  /**
   * Initialize Callx with configuration
   */
  async initialize(config: CallxConfig & CallEventListeners): Promise<void> {
    // Store event listeners
    this.listeners = {
      onIncomingCall: config.onIncomingCall,
      onCallEnded: config.onCallEnded,
      onCallMissed: config.onCallMissed,
      onCallAnswered: config.onCallAnswered,
      onCallDeclined: config.onCallDeclined,
    };

    // Initialize native module
    await Callx.initialize(config);
  }

  /**
   * Show incoming call screen
   */
  async showIncomingCall(callData: CallData): Promise<void> {
    await Callx.showIncomingCall(callData);
    this.listeners.onIncomingCall?.(callData);
  }

  /**
   * End current call
   */
  async endCall(callId: string): Promise<void> {
    await Callx.endCall(callId);
  }

  /**
   * Answer incoming call
   */
  async answerCall(callId: string): Promise<void> {
    await Callx.answerCall(callId);
  }

  /**
   * Decline incoming call
   */
  async declineCall(callId: string): Promise<void> {
    await Callx.declineCall(callId);
  }

  /**
   * Handle FCM message - using any type for compatibility
   */
  async handleFcmMessage(data: any): Promise<void> {
    await Callx.handleFcmMessage(data);
  }

  /**
   * Set field mapping for FCM data extraction
   */
  async setFieldMapping(
    field: string,
    path: string,
    fallback?: string
  ): Promise<void> {
    await Callx.setFieldMapping(field, path, fallback);
  }

  /**
   * Set trigger configuration
   */
  async setTrigger(
    trigger: string,
    field: string,
    value: string
  ): Promise<void> {
    await Callx.setTrigger(trigger, field, value);
  }

  /**
   * Get current active call
   */
  async getCurrentCall(): Promise<CallData | null> {
    return await Callx.getCurrentCall();
  }

  /**
   * Check if call is currently active
   */
  async isCallActive(): Promise<boolean> {
    return await Callx.isCallActive();
  }

  // Legacy method for testing
  multiply(a: number, b: number): number {
    return Callx.multiply(a, b);
  }
}

// Export singleton instance
export const CallxInstance = new CallxManager();

// Default export
export default CallxInstance;

// Legacy multiply function for backward compatibility
export function multiply(a: number, b: number): number {
  return Callx.multiply(a, b);
}
