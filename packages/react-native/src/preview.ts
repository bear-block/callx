import {Callx, CallxError, CONTRACT_VERSION} from './index.js';
import type {Call, CallInput, CallxBackend, CallxConfig, Capabilities, Command, CommandResult, OperationLookup, Snapshot} from './index.js';

/** Memory-only UX simulator. No OS UI, microphone, push, timers, network, or replay. */
class PreviewBackend implements CallxBackend {
  private readonly accountGeneration = 'preview-generation-1';
  private readonly operations = new Map<string, {fingerprint: string; result: CommandResult}>();
  private snapshot: Snapshot = Object.freeze({sequence: '0', call: null});
  private listeners = new Set<(snapshot: Snapshot) => void>();
  private sequence = 0n;
  private ready = false;
  private disposed = false;
  private notifying = false;
  private notifications: Snapshot[] = [];
  private guard(requireSetup = true): void {
    if (this.disposed) throw new CallxError('disposed', 'Preview has been disposed.');
    if (requireSetup && !this.ready) throw new CallxError('notConfigured', 'Call setup first.');
  }
  async setup(config: CallxConfig): Promise<Capabilities> {
    this.guard(false);
    if (!config.appName.trim()) throw new CallxError('invalidArgument', 'appName is required.');
    this.ready = true;
    return {contractVersion: CONTRACT_VERSION, coreVersion: 'preview', execution: 'preview',
      accountGeneration: this.accountGeneration,
      nativeCalling: false, durableReplay: false, providerManagedSignaling: false,
      hold: true, mute: true};
  }
  private commit(call: Call | null): void {
    this.snapshot = Object.freeze({sequence: String(++this.sequence), call: call ? Object.freeze({...call}) : null});
    this.notifications.push(this.snapshot);
    if (this.notifying) return;
    this.notifying = true;
    try {
      // Queue reentrant mutations so every observer sees the same sequence order.
      while (this.notifications.length) {
        const committed = this.notifications.shift()!;
        for (const listener of [...this.listeners]) {
          try { listener(committed); } catch { /* Applied command must not become a false rejection. */ }
        }
      }
    } finally { this.notifying = false; }
  }
  private requireCall(id?: string): Call {
    this.guard();
    const call = this.snapshot.call;
    if (!call || (id !== undefined && id !== call.callId)) throw new CallxError('callNotFound', 'Call not found.');
    if (call.state === 'ended') throw new CallxError('invalidState', 'Call has ended.');
    return call;
  }
  private create(input: CallInput, direction: 'incoming' | 'outgoing'): void {
    this.guard();
    if (!input.callId.trim() || !input.displayName.trim()) throw new CallxError('invalidArgument', 'callId and displayName are required.');
    if (this.snapshot.call && this.snapshot.call.state !== 'ended') throw new CallxError('busy', 'One live call is supported.');
    this.commit({...input, direction, state: direction, muted: false, mediaReady: false,
      createdAtMs: Date.now()});
  }
  async execute(command: Command): Promise<CommandResult> {
    this.guard();
    const fingerprint = JSON.stringify(command.type === 'startCall'
      ? {type: command.type, input: command.input}
      : command.type === 'setMuted' || command.type === 'setHeld'
        ? {type: command.type, callId: command.callId, value: command.value}
        : {type: command.type, callId: command.callId});
    const previous = this.operations.get(command.operationId);
    if (previous) {
      if (previous.fingerprint === fingerprint) return previous.result;
      return {contractVersion: CONTRACT_VERSION, operationId: command.operationId,
        status: 'rejected', execution: 'preview', completedAtMs: Date.now(),
        error: {code: 'conflict', message: 'operationId was already used with different arguments.', retryable: false}};
    }
    if (command.type === 'startCall') this.create(command.input, 'outgoing');
    else {
      const call = this.requireCall(command.callId);
      switch (command.type) {
        case 'answer':
          if (call.state !== 'incoming') throw new CallxError('invalidState', 'Only incoming calls can be answered.');
          this.commit({...call, state: 'connecting', acceptedAtMs: Date.now()});
          break;
        case 'end':
          this.commit({...call, state: 'ended', mediaReady: false, endedAtMs: Date.now(),
            endReason: call.state === 'incoming' ? 'declined' : 'localHangup'});
          break;
        case 'setMuted':
        case 'setHeld':
          if (call.state !== 'active' && call.state !== 'held') throw new CallxError('invalidState', 'Wait for simulated media connection.');
          this.commit(command.type === 'setMuted' ? {...call, muted: command.value}
            : {...call, state: command.value ? 'held' : 'active'});
          break;
      }
    }
    const result: CommandResult = {contractVersion: CONTRACT_VERSION, operationId: command.operationId,
      status: 'applied', execution: 'preview', completedAtMs: Date.now()};
    this.operations.set(command.operationId, {fingerprint, result});
    return result;
  }
  async queryOperation(operationId: string, accountGeneration: string): Promise<OperationLookup> {
    this.guard();
    if (accountGeneration !== this.accountGeneration) return {contractVersion: CONTRACT_VERSION,
      operationId, accountGeneration, status: 'generationMismatch'};
    const result = this.operations.get(operationId)?.result;
    return result ? {contractVersion: CONTRACT_VERSION, operationId, accountGeneration,
      status: 'available', result} : {contractVersion: CONTRACT_VERSION, operationId,
      accountGeneration, status: 'unavailable'};
  }
  async getSnapshot(): Promise<Snapshot> { this.guard(false); return this.snapshot; }
  observe(listener: (snapshot: Snapshot) => void): () => void {
    this.guard(false);
    this.listeners.add(listener);
    try { listener(this.snapshot); } catch (error) { this.listeners.delete(listener); throw error; }
    return () => { this.listeners.delete(listener); };
  }
  async incoming(input: CallInput): Promise<void> { this.create(input, 'incoming'); }
  async remoteAnswered(): Promise<void> {
    const call = this.requireCall();
    if (call.state !== 'outgoing') throw new CallxError('invalidState', 'Only outgoing calls can be remotely answered.');
    this.commit({...call, state: 'connecting', acceptedAtMs: Date.now()});
  }
  async mediaConnected(): Promise<void> {
    const call = this.requireCall();
    if (call.state !== 'connecting') throw new CallxError('invalidState', 'Answer before connecting media.');
    this.commit({...call, state: 'active', mediaReady: true, mediaConnectedAtMs: Date.now()});
  }
  async remoteEnded(): Promise<void> {
    const call = this.requireCall();
    this.commit({...call, state: 'ended', mediaReady: false, endedAtMs: Date.now(), endReason: 'remoteEnded'});
  }
  async reset(): Promise<void> { this.guard(); this.commit(null); }
  dispose(): void { this.disposed = true; this.listeners.clear(); }
}
export function createCallxPreview() {
  const backend = new PreviewBackend();
  return {
    callx: new Callx(backend),
    simulator: {
      incoming: (input: CallInput) => backend.incoming(input),
      remoteAnswered: () => backend.remoteAnswered(),
      mediaConnected: () => backend.mediaConnected(),
      remoteEnded: () => backend.remoteEnded(),
      reset: () => backend.reset(),
    },
  };
}
