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
  constructor(binding?: {module: NativeModule; rn: ReactNativeShape}) {
    if (binding) this.loaded = Promise.resolve(binding);
  }
  private async native(): Promise<{module: NativeModule; rn: ReactNativeShape}> {
    try {
      const rn = await import('react-native') as unknown as ReactNativeShape;
      const module = rn.NativeModules.Callx as NativeModule | undefined;
      if (!module) throw new CallxError('nativeUnavailable', 'Callx native module is not linked.');
      return {module, rn};
    } catch (error) {
      if (error instanceof CallxError) throw error;
      throw new CallxError('nativeUnavailable', 'React Native or the Callx native module is unavailable.');
    }
  }
  private binding() { return this.loaded ??= this.native(); }
  async setup(config: CallxConfig) { return (await this.binding()).module.setup({contractVersion: CONTRACT_VERSION, ...config}); }
  async execute(command: Command) { return (await this.binding()).module.execute(command); }
  async queryOperation(operationId: string, accountGeneration: string) {
    return (await this.binding()).module.queryOperation({contractVersion: CONTRACT_VERSION, operationId, accountGeneration});
  }
  async openSession(afterSequence?: string) {
    return (await this.binding()).module.openSession({contractVersion: CONTRACT_VERSION, ...(afterSequence ? {afterSequence} : {})});
  }
  observeEvents(sessionId: string, listener: (event: CallEvent) => void): () => void {
    let active = true;
    let subscription: {remove(): void} | undefined;
    void this.binding().then(({module, rn}) => {
      if (!active) return;
      subscription = new rn.NativeEventEmitter(module).addListener('callxEvent', (raw) => {
        const event = raw as CallEvent & {sessionId?: string};
        if (event.sessionId === sessionId) listener(event);
      });
    });
    return () => { active = false; subscription?.remove(); };
  }
  async acknowledge(sessionId: string, throughSequence: string) {
    await (await this.binding()).module.acknowledge({sessionId, throughSequence});
  }
  async closeSession(sessionId: string) { await (await this.binding()).module.closeSession({sessionId}); }
  async getSnapshot() { return (await this.binding()).module.getSnapshot(); }
  observe(listener: (snapshot: Snapshot) => void): () => void {
    let active = true;
    let off = () => {};
    void this.getSnapshot().then((snapshot) => { if (active) listener(snapshot); });
    void this.openSession().then((session) => {
      if (!active) return;
      off = this.observeEvents(session.sessionId, () => { void this.getSnapshot().then(listener); });
    });
    return () => { active = false; off(); };
  }
  dispose() { void this.binding().then(({module}) => module.dispose()); }
}
