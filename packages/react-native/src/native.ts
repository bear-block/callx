import {CallxError, CONTRACT_VERSION} from './index.js';
import type {CallEvent, CallxBackend, CallxConfig, Capabilities, Command, CommandResult,
  ObservationSession, OperationLookup, Snapshot} from './index.js';

export interface NativeModule {
  setup(value: object): Promise<Capabilities>;
  execute(value: Command): Promise<CommandResult>;
  queryOperation(value: object): Promise<OperationLookup>;
  openSession(value: object): Promise<ObservationSession>;
  acknowledge(value: object): Promise<void>;
  closeSession(value: object): Promise<void>;
  getSnapshot(): Promise<Snapshot>;
  dispose(): void;
}

export type ReactNativeShape = {
  NativeModules: Record<string, unknown>;
  NativeEventEmitter: new (module?: unknown) => {
    addListener(name: string, listener: (value: unknown) => void): {remove(): void};
  };
};

export class NativeCallxBackend implements CallxBackend {
  private loaded?: Promise<{module: NativeModule; rn: ReactNativeShape}>;
  // The native runtime keeps one observation session; opening another makes
  // the previous one stale. Snapshot observers share whichever session is active.
  private activeSessionId?: string;
  private observerSessionId?: string;
  private openingObserverSession?: Promise<void>;
  private snapshotObservers = 0;
  constructor(binding?: {module: NativeModule; rn: ReactNativeShape}) {
    if (binding) this.loaded = Promise.resolve(binding);
  }
  private async native(): Promise<{module: NativeModule; rn: ReactNativeShape}> {
    try {
      const imported = await import('react-native') as unknown as ReactNativeShape & {default?: ReactNativeShape};
      // Metro may wrap React Native's CommonJS exports under `default` for dynamic imports.
      const rn = imported.NativeModules ? imported : imported.default;
      if (!rn?.NativeModules) throw new CallxError('nativeUnavailable', 'React Native bindings are unavailable.');
      const module = rn.NativeModules.Callx as NativeModule | undefined;
      if (!module) throw new CallxError('nativeUnavailable', 'Callx native module is not linked.');
      return {module, rn};
    } catch (error) {
      if (error instanceof CallxError) throw error;
      const cause = error instanceof Error ? error.message : String(error);
      throw new CallxError('nativeUnavailable', `React Native or the Callx native module is unavailable: ${cause}`);
    }
  }
  private binding() { return this.loaded ??= this.native(); }
  async setup(config: CallxConfig) { return (await this.binding()).module.setup({contractVersion: CONTRACT_VERSION, ...config}); }
  async execute(command: Command) { return (await this.binding()).module.execute(command); }
  async queryOperation(operationId: string, accountGeneration: string) {
    return (await this.binding()).module.queryOperation({contractVersion: CONTRACT_VERSION, operationId, accountGeneration});
  }
  async openSession(afterSequence?: string) {
    const session = await (await this.binding()).module.openSession(
      {contractVersion: CONTRACT_VERSION, ...(afterSequence ? {afterSequence} : {})});
    this.activeSessionId = session.sessionId;
    return session;
  }
  private subscribe(listener: (event: CallEvent & {sessionId?: string}) => void): () => void {
    let active = true;
    let subscription: {remove(): void} | undefined;
    void this.binding().then(({module, rn}) => {
      if (!active) return;
      subscription = new rn.NativeEventEmitter(module).addListener('callxEvent',
        (raw) => listener(raw as CallEvent & {sessionId?: string}));
    }, () => {});
    return () => { active = false; subscription?.remove(); };
  }
  observeEvents(sessionId: string, listener: (event: CallEvent) => void): () => void {
    return this.subscribe((event) => { if (event.sessionId === sessionId) listener(event); });
  }
  async acknowledge(sessionId: string, throughSequence: string) {
    await (await this.binding()).module.acknowledge({sessionId, throughSequence});
  }
  async closeSession(sessionId: string) {
    await (await this.binding()).module.closeSession({sessionId});
    if (this.activeSessionId === sessionId) this.activeSessionId = undefined;
    if (this.observerSessionId === sessionId) this.observerSessionId = undefined;
    // Native stops emitting without a session, so keep live observers fed.
    if (this.snapshotObservers > 0) await this.ensureObserverSession();
  }
  private ensureObserverSession(): Promise<void> {
    if (this.activeSessionId) return Promise.resolve();
    return this.openingObserverSession ??= this.openSession()
      .then((session) => { this.observerSessionId = session.sessionId; })
      .finally(() => { this.openingObserverSession = undefined; });
  }
  private async releaseObserverSession() {
    const sessionId = this.observerSessionId;
    this.observerSessionId = undefined;
    if (!sessionId || sessionId !== this.activeSessionId) return;
    // Best effort: a stale or already-closed session needs no cleanup.
    await this.closeSession(sessionId).catch(() => {});
  }
  async getSnapshot() { return (await this.binding()).module.getSnapshot(); }
  observe(listener: (snapshot: Snapshot) => void): () => void {
    let active = true;
    let refreshing = Promise.resolve();
    const refresh = () => {
      refreshing = refreshing.then(async () => {
        const snapshot = await this.getSnapshot();
        if (active) listener(snapshot);
      }).catch(() => {});
    };
    this.snapshotObservers++;
    // Subscribe before reading so no change lands between the two.
    const off = this.subscribe(refresh);
    void this.ensureObserverSession().catch(() => {}).then(refresh);
    return () => {
      if (!active) return;
      active = false; off();
      if (--this.snapshotObservers === 0) void this.releaseObserverSession();
    };
  }
  dispose() { void this.binding().then(({module}) => module.dispose()); }
}
