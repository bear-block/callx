import Callx from './NativeCallx';
import type { CallData, CallxConfig } from './NativeCallx';

export interface CallEventListeners {
  onIncomingCall?: (data: CallData) => void;
  onCallAnswered?: (data: CallData) => void;
  onCallDeclined?: (data: CallData) => void;
  onCallEnded?: (data: CallData) => void;
  onCallMissed?: (data: CallData) => void;
  onCallAnsweredElsewhere?: (data: CallData) => void;

  // Token events (FCM for Android, VoIP for iOS)
  onTokenUpdated?: (data: { token: string }) => void;
}

/**
 * CallxManager - Main class for managing incoming call functionality
 * Provides a high-level interface for handling call UI, FCM messages, and call events
 */
class CallxManager {
  private listeners: CallEventListeners = {};

  /**
   * Initialize Callx with configuration
   * @param config Configuration object including triggers, fields, and event listeners
   * @returns Promise that resolves when initialization is complete
   */
  async initialize(config: CallxConfig & CallEventListeners): Promise<void> {
    // Store event listeners
    this.listeners = {
      onIncomingCall: config.onIncomingCall,
      onCallAnswered: config.onCallAnswered,
      onCallDeclined: config.onCallDeclined,
      onCallEnded: config.onCallEnded,
      onCallMissed: config.onCallMissed,
      onCallAnsweredElsewhere: config.onCallAnsweredElsewhere,
      onTokenUpdated: config.onTokenUpdated,
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
   * Get current FCM token
   */
  async getFCMToken(): Promise<string> {
    return await Callx.getFCMToken();
  }

  /**
   * Get current VoIP token (iOS only)
   */
  async getVoIPToken(): Promise<string> {
    return await Callx.getVoIPToken();
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

  /**
   * Hide app from lock screen after call ends
   * Removes app from over lock screen and moves to background
   */
  async hideFromLockScreen(): Promise<boolean> {
    return await Callx.hideFromLockScreen();
  }

  /**
   * Move app to background (simulate home button press)
   */
  async moveAppToBackground(): Promise<boolean> {
    return await Callx.moveAppToBackground();
  }

  /**
   * Handle token updates from native layer (FCM for Android, VoIP for iOS)
   */
  handleTokenUpdate(token: string): void {
    this.listeners.onTokenUpdated?.({ token });
  }

  /**
   * Get current configuration for debugging
   */
  async getConfiguration(): Promise<any> {
    return await Callx.getConfiguration();
  }
}

// Export singleton instance
export const CallxInstance = new CallxManager();

// Default export
export default CallxInstance;
