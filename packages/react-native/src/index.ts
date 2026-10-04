import {NativeCallxBackend} from './native.js';

/** Contract v0; 0.3 adds phone features (ADR-0013). */
export const CONTRACT_VERSION = '0.3.0' as const;
export const CALL_STATES = ['incoming', 'outgoing', 'connecting', 'active', 'held', 'ended'] as const;
export const END_REASONS = ['localHangup', 'declined', 'remoteEnded', 'callerCancelled',
  'unanswered', 'busy', 'failed', 'answeredElsewhere', 'declinedElsewhere'] as const;
export const COMMAND_STATUSES = ['applied', 'rejected', 'timedOut', 'unknown'] as const;
export const ERROR_CODES = ['invalidArgument', 'notConfigured', 'callNotFound', 'busy',
  'invalidState', 'unsupported', 'permissionDenied', 'platformRejected', 'mediaNotReady',
  'deadlineExceeded', 'conflict', 'journalGap', 'nativeUnavailable', 'internal'] as const;
export type CallState = typeof CALL_STATES[number];
export type EndReason = typeof END_REASONS[number];
export type CommandStatus = typeof COMMAND_STATUSES[number];
export type OperationLookupStatus = 'available' | 'unavailable' | 'generationMismatch';
export type SessionOpenStatus = 'fresh' | 'resumed' | 'resynced';
export type EventKind = 'callChanged' | 'operationCompleted' | 'resyncRequired';
export type ErrorCode = typeof ERROR_CODES[number];
export type ExecutionMode = 'native' | 'preview';
/** The local camera: `blocked` means it was on and the OS took it, for example in the background. */
export type LocalVideo = 'off' | 'on' | 'blocked';
export type CameraFacing = 'front' | 'back';
export type AudioRouteKind = 'earpiece' | 'speaker' | 'bluetooth' | 'wired' | 'other';
export interface AudioRoute { readonly id: string; readonly kind: AudioRouteKind; readonly name: string }
export interface CallRequest { readonly handle: string; readonly displayName?: string; readonly video: boolean }
export interface Call {
  readonly callId: string;
  readonly displayName: string;
  readonly direction: 'incoming' | 'outgoing';
  readonly state: CallState;
  readonly muted: boolean;
  readonly mediaReady: boolean;
  /**
   * Media connected once and has since dropped, for example while the media SDK reconnects.
   * The call is still live; show a reconnecting state. Absent means false.
   */
  readonly mediaInterrupted?: boolean;
  /** Offered or started as a video call. Absent means false. */
  readonly video?: boolean;
  /** Absent means `off`. */
  readonly localVideo?: LocalVideo;
  /** Present while `localVideo` is not `off`. */
  readonly cameraFacing?: CameraFacing;
  /** A remote video track is available to render. Absent means false. */
  readonly remoteVideo?: boolean;
  /** Available OS audio endpoints; absent until observed. */
  readonly audioRoutes?: readonly AudioRoute[];
  readonly audioRoute?: string;
  readonly endReason?: EndReason;
  readonly createdAtMs?: number;
  readonly acceptedAtMs?: number;
  readonly mediaConnectedAtMs?: number;
  readonly endedAtMs?: number;
}
export interface Snapshot {
  /** Preview alias. Production observation sessions use watermark and calls. */
  readonly sequence: string;
  readonly call: Call | null;
}
export interface PlatformError { readonly domain: string; readonly code: string }
export interface OperationError {
  readonly code: ErrorCode;
  readonly message: string;
  readonly retryable: boolean;
  readonly platform?: PlatformError;
}
export interface CommandResult {
  readonly contractVersion: typeof CONTRACT_VERSION;
  readonly operationId: string;
  readonly status: CommandStatus;
  readonly execution: ExecutionMode;
  readonly completedAtMs: number;
  readonly error?: OperationError;
}
export interface OperationLookup {
  readonly contractVersion: typeof CONTRACT_VERSION;
  readonly operationId: string;
  readonly accountGeneration: string;
  readonly status: OperationLookupStatus;
  readonly result?: CommandResult;
}
export interface CallEvent {
  readonly contractVersion: typeof CONTRACT_VERSION;
  readonly eventId: string;
  readonly sequence: string;
  readonly kind: EventKind;
  readonly source: 'local' | 'platform' | 'signaling' | 'media' | 'recovery';
  readonly observedAtMs: number;
  readonly callId?: string;
  readonly operationId?: string;
}
export interface ObservationSnapshot {
  readonly contractVersion: typeof CONTRACT_VERSION;
  readonly watermark: string;
  readonly calls: readonly Call[];
}
export interface ObservationSession {
  readonly contractVersion: typeof CONTRACT_VERSION;
  readonly sessionId: string;
  readonly accountGeneration: string;
  readonly status: SessionOpenStatus;
  readonly snapshot: ObservationSnapshot;
  readonly replay: readonly CallEvent[];
}
export interface CallInput {
  callId: string; displayName: string; handle: string;
  /** Report the call to CallKit and Telecom as a video call. */
  video?: boolean;
}
export interface CallxConfig {
  /**
   * @deprecated Ignored; kept so `setup({appName})` keeps compiling. The system call screen shows
   * your app's display name on both platforms.
   */
  appName?: string;
}
export interface Capabilities {
  readonly contractVersion: typeof CONTRACT_VERSION;
  readonly coreVersion: string;
  readonly execution: ExecutionMode;
  readonly accountGeneration: string;
  readonly nativeCalling: boolean;
  readonly durableReplay: boolean;
  readonly providerManagedSignaling: boolean;
  readonly hold: boolean;
  readonly mute: boolean;
  /** A video media adapter is installed; `setCamera` and `switchCamera` work. */
  readonly video: boolean;
  /** The installed media adapter can send keypad tones. */
  readonly dtmf: boolean;
}
export interface CommandOptions { readonly operationId?: string; readonly deadlineAtMs?: number }
/**
 * The device's push token for Callx invitations: `voip` (APNs PushKit) on iOS, `fcm` on Android.
 * Register it with your backend for the signed-in account; null until the platform issued one.
 */
export interface PushToken { readonly type: 'voip' | 'fcm'; readonly token: string }
export type Command =
  | { contractVersion: typeof CONTRACT_VERSION; operationId: string; deadlineAtMs?: number; type: 'startCall'; input: CallInput }
  | { contractVersion: typeof CONTRACT_VERSION; operationId: string; deadlineAtMs?: number; type: 'answer' | 'end'; callId: string }
  | { contractVersion: typeof CONTRACT_VERSION; operationId: string; deadlineAtMs?: number; type: 'setMuted' | 'setHeld' | 'setCamera'; callId: string; value: boolean }
  | { contractVersion: typeof CONTRACT_VERSION; operationId: string; deadlineAtMs?: number; type: 'switchCamera'; callId: string; value: CameraFacing }
  | { contractVersion: typeof CONTRACT_VERSION; operationId: string; deadlineAtMs?: number; type: 'setAudioRoute' | 'sendDtmf' | 'setDisplayName'; callId: string; value: string };
export class CallxError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'CallxError';
  }
}
/** Transport seam. Production will delegate to native, not the preview reducer. */
export interface CallxBackend {
  setup(config?: CallxConfig): Promise<Capabilities>;
  execute(command: Command): Promise<CommandResult>;
  queryOperation(operationId: string, accountGeneration: string): Promise<OperationLookup>;
  openSession(afterSequence?: string): Promise<ObservationSession>;
  observeEvents(sessionId: string, listener: (event: CallEvent) => void): () => void;
  acknowledge(sessionId: string, throughSequence: string): Promise<void>;
  closeSession(sessionId: string): Promise<void>;
  getSnapshot(): Promise<Snapshot>;
  getPushToken(): Promise<PushToken | null>;
  observe(listener: (snapshot: Snapshot) => void): () => void;
  addCallRequestListener?(listener: (request: CallRequest) => void): () => void;
  dispose(): void;
}
export class Callx {
  private operationCounter = 0;
  private readonly transport: CallxBackend;
  constructor(transport?: CallxBackend) { this.transport = transport ?? new NativeCallxBackend(); }
  private get backend(): CallxBackend {
    return this.transport;
  }
  async setup(config: CallxConfig = {}): Promise<Capabilities> { return this.backend.setup(config); }
  private operation(options?: CommandOptions): {operationId: string; deadlineAtMs?: number} {
    const operationId = options?.operationId ?? `callx-op-${Date.now()}-${++this.operationCounter}`;
    if (!operationId.trim()) throw new CallxError('invalidArgument', 'operationId is required.');
    return options?.deadlineAtMs === undefined ? {operationId} : {operationId, deadlineAtMs: options.deadlineAtMs};
  }
  async startCall(input: CallInput, options?: CommandOptions): Promise<CommandResult> {
    return this.backend.execute({contractVersion: CONTRACT_VERSION, ...this.operation(options), type: 'startCall', input});
  }
  async answer(callId: string, options?: CommandOptions): Promise<CommandResult> {
    return this.backend.execute({contractVersion: CONTRACT_VERSION, ...this.operation(options), type: 'answer', callId});
  }
  async end(callId: string, options?: CommandOptions): Promise<CommandResult> {
    return this.backend.execute({contractVersion: CONTRACT_VERSION, ...this.operation(options), type: 'end', callId});
  }
  async setMuted(callId: string, value: boolean, options?: CommandOptions): Promise<CommandResult> {
    return this.backend.execute({contractVersion: CONTRACT_VERSION, ...this.operation(options), type: 'setMuted', callId, value});
  }
  async setHeld(callId: string, value: boolean, options?: CommandOptions): Promise<CommandResult> {
    return this.backend.execute({contractVersion: CONTRACT_VERSION, ...this.operation(options), type: 'setHeld', callId, value});
  }
  /**
   * Turns the local camera on or off. Applied once the media adapter publishes or stops the
   * camera; rejected with `permissionDenied` without the camera permission, `mediaNotReady` while
   * the app is in the background, and `unsupported` without a video adapter.
   */
  async setCamera(callId: string, on: boolean, options?: CommandOptions): Promise<CommandResult> {
    return this.backend.execute({contractVersion: CONTRACT_VERSION, ...this.operation(options), type: 'setCamera', callId, value: on});
  }
  /** Chooses the front or back camera; remembered while the camera is off. */
  async switchCamera(callId: string, facing: CameraFacing, options?: CommandOptions): Promise<CommandResult> {
    return this.backend.execute({contractVersion: CONTRACT_VERSION, ...this.operation(options), type: 'switchCamera', callId, value: facing});
  }
  /** Select an id from the call's observed audioRoutes. */
  async setAudioRoute(callId: string, routeId: string, options?: CommandOptions): Promise<CommandResult> {
    return this.backend.execute({contractVersion: CONTRACT_VERSION, ...this.operation(options), type: 'setAudioRoute', callId, value: routeId});
  }
  /** Send 1–32 keypad digits (0–9, * and #) during an active call. */
  async sendDtmf(callId: string, digits: string, options?: CommandOptions): Promise<CommandResult> {
    return this.backend.execute({contractVersion: CONTRACT_VERSION, ...this.operation(options), type: 'sendDtmf', callId, value: digits});
  }
  async setDisplayName(callId: string, name: string, options?: CommandOptions): Promise<CommandResult> {
    return this.backend.execute({contractVersion: CONTRACT_VERSION, ...this.operation(options), type: 'setDisplayName', callId, value: name});
  }
  /** A system request is not a call: look up its handle and decide whether to startCall. */
  addCallRequestListener(listener: (request: CallRequest) => void): () => void {
    return this.backend.addCallRequestListener?.(listener) ?? (() => {});
  }
  /** The push token to register with your backend after sign-in and on each launch. */
  async getPushToken(): Promise<PushToken | null> { return this.backend.getPushToken(); }
  async queryOperation(operationId: string, accountGeneration: string): Promise<OperationLookup> {
    return this.backend.queryOperation(operationId, accountGeneration);
  }
  async openSession(afterSequence?: string): Promise<ObservationSession> {
    return this.backend.openSession(afterSequence);
  }
  observeEvents(sessionId: string, listener: (event: CallEvent) => void): () => void {
    return this.backend.observeEvents(sessionId, listener);
  }
  async acknowledge(sessionId: string, throughSequence: string): Promise<void> {
    return this.backend.acknowledge(sessionId, throughSequence);
  }
  async closeSession(sessionId: string): Promise<void> { return this.backend.closeSession(sessionId); }
  async getSnapshot(): Promise<Snapshot> { return this.backend.getSnapshot(); }
  /** Preview contract: initial snapshot is delivered immediately; unsubscribe does not end a call. */
  observe(listener: (snapshot: Snapshot) => void): () => void { return this.backend.observe(listener); }
  dispose(): void { this.transport.dispose(); }
}
