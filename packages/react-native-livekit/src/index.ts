/**
 * LiveKit media adapter for @bear-block/callx (ADR-0009). Installing this package is the whole
 * integration: Callx's native bootstrap discovers the adapter and joins the call's LiveKit room
 * when a call is answered, even while JavaScript is not running. JavaScript only configures where
 * room credentials come from.
 */

/**
 * Where the adapter gets room credentials. It sends `POST tokenUrl` with `headers` and
 * `{"callId": "..."}`; your backend authenticates the user, checks call membership and answers
 * `{"url": "wss://...", "token": "..."}`.
 */
export interface LiveKitConfig {
  readonly tokenUrl: string;
  /** For example an authorization header. Stored encrypted (Android Keystore, iOS keychain). */
  readonly headers?: Readonly<Record<string, string>>;
}

interface NativeLiveKit {
  configure(tokenUrl: string, headers: Record<string, string>): Promise<void>;
  reset(): Promise<void>;
}

export class CallxLiveKitError extends Error {
  constructor(message: string) { super(message); this.name = 'CallxLiveKitError'; }
}

type NativeBinding = {NativeModules: Record<string, unknown>};
let binding: Promise<NativeLiveKit> | undefined;

async function native(): Promise<NativeLiveKit> {
  binding ??= (async () => {
    const imported = await import('react-native') as unknown as NativeBinding & {default?: NativeBinding};
    // Metro may wrap React Native's CommonJS exports under `default` for dynamic imports.
    const rn = imported.NativeModules ? imported : imported.default;
    const module = rn?.NativeModules.CallxLiveKit as NativeLiveKit | undefined;
    if (!module) throw new CallxLiveKitError('The Callx LiveKit native module is not linked; rebuild the app.');
    return module;
  })();
  return binding;
}

/** Validates a configuration; exported for tests. */
export function validateConfig(config: LiveKitConfig): void {
  if (!/^https?:\/\/\S+$/.test(config.tokenUrl)) throw new CallxLiveKitError('tokenUrl must be an http(s) URL.');
  for (const [name, value] of Object.entries(config.headers ?? {})) {
    if (!name || typeof value !== 'string') throw new CallxLiveKitError(`Header ${name || '(empty)'} must be a string.`);
  }
}

/** Persist the credential source. Call after sign-in and whenever the session token changes. */
export async function configureLiveKit(config: LiveKitConfig): Promise<void> {
  validateConfig(config);
  await (await native()).configure(config.tokenUrl, {...config.headers});
}

/** Forget the credential source, for example on sign-out. */
export async function resetLiveKit(): Promise<void> {
  await (await native()).reset();
}
