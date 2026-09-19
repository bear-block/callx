import {NativeCallxBackend} from './native.js';

/** Contract v0 candidate. */
export const CONTRACT_VERSION = '0.1.0' as const;
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
export interface Call {
  readonly callId: string;
  readonly displayName: string;
  readonly direction: 'incoming' | 'outgoing';
  readonly state: CallState;
  readonly muted: boolean;
  readonly mediaReady: boolean;
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
export interface CallInput { callId: string; displayName: string; handle: string }
export interface CallxConfig { appName: string }
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
}
export interface CommandOptions { readonly operationId?: string; readonly deadlineAtMs?: number }
export type Command =
  | { contractVersion: typeof CONTRACT_VERSION; operationId: string; deadlineAtMs?: number; type: 'startCall'; input: CallInput }
  | { contractVersion: typeof CONTRACT_VERSION; operationId: string; deadlineAtMs?: number; type: 'answer' | 'end'; callId: string }
  | { contractVersion: typeof CONTRACT_VERSION; operationId: string; deadlineAtMs?: number; type: 'setMuted' | 'setHeld'; callId: string; value: boolean };
export class CallxError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'CallxError';
  }
}
/** Transport seam. Production will delegate to native, not the preview reducer. */
export interface CallxBackend {
  setup(config: CallxConfig): Promise<Capabilities>;
  execute(command: Command): Promise<CommandResult>;
  queryOperation(operationId: string, accountGeneration: string): Promise<OperationLookup>;
  openSession(afterSequence?: string): Promise<ObservationSession>;
  observeEvents(sessionId: string, listener: (event: CallEvent) => void): () => void;
  acknowledge(sessionId: string, throughSequence: string): Promise<void>;
  closeSession(sessionId: string): Promise<void>;
  getSnapshot(): Promise<Snapshot>;
  observe(listener: (snapshot: Snapshot) => void): () => void;
  dispose(): void;
}
export class Callx {
  private operationCounter = 0;
  private readonly transport: CallxBackend;
  constructor(transport?: CallxBackend) { this.transport = transport ?? new NativeCallxBackend(); }
  private get backend(): CallxBackend {
    return this.transport;
  }
  async setup(config: CallxConfig): Promise<Capabilities> { return this.backend.setup(config); }
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
