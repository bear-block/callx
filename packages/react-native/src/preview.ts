import {Callx, CallxError, CONTRACT_VERSION} from './index.js';
import type {Call, CallEvent, CallInput, CallxBackend, CallxConfig, Capabilities, Command, CommandResult, ObservationSession, OperationLookup, Snapshot} from './index.js';

/** Memory-only UX simulator. No OS UI, microphone, push, timers, network, or replay. */
class PreviewBackend implements CallxBackend {
  private readonly accountGeneration = 'preview-generation-1';
  private readonly operations = new Map<string, {fingerprint: string; result: CommandResult}>();
  private readonly journal: CallEvent[] = [];
  private eventListeners = new Set<(event: CallEvent) => void>();
  private pendingSessionEvents: CallEvent[] = [];
  private activeSession?: {id: string; acknowledged: bigint};
  private sessionCounter = 0;
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
  async setup(_config?: CallxConfig): Promise<Capabilities> {
    this.guard(false);
    this.ready = true;
    return {contractVersion: CONTRACT_VERSION, coreVersion: 'preview', execution: 'preview',
      accountGeneration: this.accountGeneration,
      nativeCalling: false, durableReplay: false, providerManagedSignaling: false,
      hold: true, mute: true};
  }
  private commit(call: Call | null): void {
    this.snapshot = Object.freeze({sequence: String(++this.sequence), call: call ? Object.freeze({...call}) : null});
    this.appendEvent('callChanged', call?.callId);
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
  private appendEvent(kind: CallEvent['kind'], callId?: string, operationId?: string): void {
    const event = Object.freeze({contractVersion: CONTRACT_VERSION, eventId: `preview-event-${this.sequence}`,
      sequence: String(this.sequence), kind, source: 'local' as const, observedAtMs: Date.now(),
      ...(callId ? {callId} : {}), ...(operationId ? {operationId} : {})});
    this.journal.push(event);
    if (this.journal.length > 2048) this.journal.shift();
    if (this.activeSession && this.eventListeners.size === 0) this.pendingSessionEvents.push(event);
    for (const listener of [...this.eventListeners]) { try { listener(event); } catch {} }
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
    if (!input.callId.trim() || !input.displayName.trim() || !input.handle.trim()) throw new CallxError('invalidArgument', 'callId, displayName and handle are required.');
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
    this.sequence++;
    this.snapshot = Object.freeze({...this.snapshot, sequence: String(this.sequence)});
    this.appendEvent('operationCompleted', undefined, command.operationId);
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
  async openSession(afterSequence?: string): Promise<ObservationSession> {
    this.guard();
    let status: ObservationSession['status'] = afterSequence === undefined ? 'fresh' : 'resumed';
    let replay: CallEvent[] = [];
    if (afterSequence !== undefined) {
      if (!/^(0|[1-9][0-9]*)$/.test(afterSequence)) throw new CallxError('invalidArgument', 'Invalid sequence.');
      const after = BigInt(afterSequence);
      const earliest = this.journal.length ? BigInt(this.journal[0]!.sequence) : this.sequence + 1n;
      if (after > this.sequence || after + 1n < earliest) status = 'resynced';
      else replay = this.journal.filter(event => BigInt(event.sequence) > after);
    }
    this.eventListeners.clear();
    this.pendingSessionEvents = [];
    const sessionId = `preview-session-${++this.sessionCounter}`;
    this.activeSession = {id: sessionId, acknowledged: 0n};
    return {contractVersion: CONTRACT_VERSION, sessionId, accountGeneration: this.accountGeneration,
      status, snapshot: {contractVersion: CONTRACT_VERSION, watermark: String(this.sequence),
        calls: this.snapshot.call ? [this.snapshot.call] : []}, replay};
  }
  observeEvents(sessionId: string, listener: (event: CallEvent) => void): () => void {
    this.guard();
    if (this.activeSession?.id !== sessionId) throw new CallxError('invalidArgument', 'Observation session is not active.');
    this.eventListeners.add(listener);
    for (const event of this.pendingSessionEvents) { try { listener(event); } catch {} }
    this.pendingSessionEvents = [];
    return () => { this.eventListeners.delete(listener); };
  }
  async acknowledge(sessionId: string, throughSequence: string): Promise<void> {
    this.guard();
    if (this.activeSession?.id !== sessionId || !/^(0|[1-9][0-9]*)$/.test(throughSequence))
      throw new CallxError('invalidArgument', 'Invalid session acknowledgement.');
    const value = BigInt(throughSequence);
    if (value < this.activeSession.acknowledged || value > this.sequence)
      throw new CallxError('invalidArgument', 'Acknowledgement must be monotonic and observed.');
    this.activeSession.acknowledged = value;
  }
  async closeSession(sessionId: string): Promise<void> {
    this.guard();
    if (this.activeSession?.id !== sessionId) return;
    this.activeSession = undefined; this.eventListeners.clear(); this.pendingSessionEvents = [];
  }
  async getSnapshot(): Promise<Snapshot> { this.guard(false); return this.snapshot; }
  /** The preview has no push transport. */
  async getPushToken(): Promise<null> { return null; }
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
  dispose(): void { this.disposed = true; this.listeners.clear(); this.eventListeners.clear(); this.pendingSessionEvents = []; }
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
