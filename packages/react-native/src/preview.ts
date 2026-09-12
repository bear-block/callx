import {Callx, CallxError} from './index.js';
import type {Call, CallInput, CallxBackend, CallxConfig, Capabilities, Command, CommandResult, Snapshot} from './index.js';

/** Memory-only UX simulator. No OS UI, microphone, push, timers, network, or replay. */
class PreviewBackend implements CallxBackend {
  private snapshot: Snapshot = Object.freeze({sequence: '0', call: null});
  private listeners = new Set<(snapshot: Snapshot) => void>();
  private sequence = 0n;
  private operation = 0;
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
    return {execution: 'preview', nativeCalling: false, durableReplay: false};
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
    this.commit({...input, direction, state: direction, muted: false, mediaReady: false});
  }
  async execute(command: Command): Promise<CommandResult> {
    this.guard();
    if (command.type === 'startCall') this.create(command.input, 'outgoing');
    else {
      const call = this.requireCall(command.callId);
      switch (command.type) {
        case 'answer':
          if (call.state !== 'incoming') throw new CallxError('invalidState', 'Only incoming calls can be answered.');
          this.commit({...call, state: 'connecting'});
          break;
        case 'end':
          this.commit({...call, state: 'ended', mediaReady: false,
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
    return {operationId: 'preview-op-' + ++this.operation, status: 'applied', execution: 'preview'};
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
    this.commit({...call, state: 'connecting'});
  }
  async mediaConnected(): Promise<void> {
    const call = this.requireCall();
    if (call.state !== 'connecting') throw new CallxError('invalidState', 'Answer before connecting media.');
    this.commit({...call, state: 'active', mediaReady: true});
  }
  async remoteEnded(): Promise<void> {
    const call = this.requireCall();
    this.commit({...call, state: 'ended', mediaReady: false, endReason: 'remoteEnded'});
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
