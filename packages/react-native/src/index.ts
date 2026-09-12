/** Public API preview. Native bridge deliberately not implemented. */
export type CallState = 'incoming' | 'outgoing' | 'connecting' | 'active' | 'held' | 'ended';
export type EndReason = 'localHangup' | 'declined' | 'remoteEnded';
export interface Call {
  readonly callId: string;
  readonly displayName: string;
  readonly direction: 'incoming' | 'outgoing';
  readonly state: CallState;
  readonly muted: boolean;
  readonly mediaReady: boolean;
  readonly endReason?: EndReason;
}
export interface Snapshot {
  readonly sequence: string;
  readonly call: Call | null;
}
export interface CommandResult {
  readonly operationId: string;
  readonly status: 'applied';
  readonly execution: 'preview';
}
export interface CallInput { callId: string; displayName: string }
export interface CallxConfig { appName: string }
export interface Capabilities {
  readonly execution: 'preview';
  readonly nativeCalling: false;
  readonly durableReplay: false;
}
export type Command =
  | { type: 'startCall'; input: CallInput }
  | { type: 'answer' | 'end'; callId: string }
  | { type: 'setMuted' | 'setHeld'; callId: string; value: boolean };
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
  getSnapshot(): Promise<Snapshot>;
  observe(listener: (snapshot: Snapshot) => void): () => void;
  dispose(): void;
}
export class Callx {
  constructor(private readonly transport?: CallxBackend) {}
  private get backend(): CallxBackend {
    if (!this.transport) throw new CallxError('nativeNotImplemented',
      'Native calling is not implemented. Explicitly import the /preview simulator for this demo.');
    return this.transport;
  }
  async setup(config: CallxConfig): Promise<Capabilities> { return this.backend.setup(config); }
  async startCall(input: CallInput): Promise<CommandResult> {
    return this.backend.execute({type: 'startCall', input});
  }
  async answer(callId: string): Promise<CommandResult> {
    return this.backend.execute({type: 'answer', callId});
  }
  async end(callId: string): Promise<CommandResult> {
    return this.backend.execute({type: 'end', callId});
  }
  async setMuted(callId: string, value: boolean): Promise<CommandResult> {
    return this.backend.execute({type: 'setMuted', callId, value});
  }
  async setHeld(callId: string, value: boolean): Promise<CommandResult> {
    return this.backend.execute({type: 'setHeld', callId, value});
  }
  async getSnapshot(): Promise<Snapshot> { return this.backend.getSnapshot(); }
  /** Preview contract: initial snapshot is delivered immediately; unsubscribe does not end a call. */
  observe(listener: (snapshot: Snapshot) => void): () => void { return this.backend.observe(listener); }
  dispose(): void { this.transport?.dispose(); }
}
