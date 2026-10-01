/**
 * Call lifecycle — shared data types.
 *
 * This is an executable prototype, not a production contract yet. The native port
 * must settle command confirmation, audio readiness and recovery before using
 * it as a conformance oracle.
 * Platform policy such as PushKit `mustReport` belongs to the native adapter.
 *
 * HOW STATES ARE CHOSEN
 * Something is a *state* only if it changes the set of valid actions.
 * Otherwise it is a *property*.
 *   - held vs active  → changes the action set (hold / resume) → state
 *   - muted           → no change → property
 *   - the other end ringing (outgoing call) → no change → the `remoteRinging` property
 * This keeps the number of states as small as possible while still verifiable.
 */

export type CallState =
  | 'incoming'
  | 'outgoing'
  | 'active'
  | 'held'
  | 'ended';

export type CallDirection = 'incoming' | 'outgoing';

/** Who caused the hold. A property of the transition, not a separate state. */
export type HeldBy = 'local' | 'remote' | 'system';

/**
 * Nine domain reasons. Platform mapping may lose detail; domain history
 * must be stored separately, not assumed to be written straight into OS Recents.
 */
export type EndReason =
  | 'localHangup'
  | 'declined'
  | 'remoteEnded'
  | 'callerCancelled'
  | 'unanswered'
  | 'busy'
  | 'failed'
  | 'answeredElsewhere'
  | 'declinedElsewhere';

/**
 * Mapping to CXCallEndedReason.
 *
 * A caller who cancels is remoteEnded in the sense of Apple's enum; unanswered
 * is for a timeout before connecting started with no party ending the call. This mapping
 * makes no promise about how Recents displays it.
 * null only says there is no matching CXCallEndedReason: a local command still needs
 * CXEndCallAction; null must not be treated as a no-op before the action completes.
 */
export const IOS_END_REASON = {
  localHangup:       null,          // a local command must perform CXEndCallAction
  declined:          null,          // the OS knows once CXEndCallAction is applied
  remoteEnded:       'remoteEnded',
  callerCancelled:   'remoteEnded', // the remote side ended it; keep the domain reason separately
  unanswered:        'unanswered',
  busy:              'failed',
  failed:            'failed',
  answeredElsewhere: 'answeredElsewhere',
  declinedElsewhere: 'declinedElsewhere',
} as const satisfies Record<EndReason, string | null>;

export type CallOrigin = 'push' | 'signal' | 'local';

/**
 * Why the operating system refused to create the call.
 *
 * Found while reading callkeep's source: its `didDisplayIncomingCall` carries
 * an `errorCode` with exactly this set of values. That means **reporting a call to the OS can
 * fail** — because of Do Not Disturb, a block list, a missing entitlement. The state
 * machine must model that, or there will be a call
 * hanging in `incoming` forever that never rings.
 */
export type ReportFailureCode =
  | 'unentitled'
  | 'duplicateId'
  | 'doNotDisturb'
  | 'blockList'
  | 'unknown';

export interface Call {
  readonly id: string;
  readonly direction: CallDirection;
  readonly origin: CallOrigin;
  readonly state: CallState;
  readonly displayName?: string;
  readonly handle?: string;
  readonly hasVideo: boolean;
  readonly muted: boolean;
  /** Outgoing call: the other end has started ringing. A property, not a state. */
  readonly remoteRinging: boolean;
  readonly heldBy?: HeldBy;
  readonly endReason?: EndReason;
  /** Free-form detail attached to the end reason, for diagnostics. Not an enum. */
  readonly endDetail?: string;
  readonly createdAt: number;
  readonly connectedAt?: number;
  readonly endedAt?: number;
}

export interface Config {
  /** How long an unanswered incoming call rings before it counts as missed. */
  readonly ringTimeoutMs: number;
  /**
   * How long to remember that a callId was cancelled, to block an "incoming call" push arriving
   * later. This value must be based on the transport's late-push delivery window (and
   * `apns-expiration`), not on `ringTimeoutMs`: the two durations are independent.
   */
  readonly tombstoneTtlMs: number;
  /**
   * How long to keep an ended call in `getCalls()`, so JS that wakes up
   * late can still observe it.
   */
  readonly endedRetentionMs: number;
}

export const DEFAULT_CONFIG: Config = {
  ringTimeoutMs: 45_000,
  tombstoneTtlMs: 60_000,
  endedRetentionMs: 60_000,
};

export interface Registry {
  readonly calls: Readonly<Record<string, Call>>;
  /** callId → tombstone expiry time. */
  readonly tombstones: Readonly<Record<string, number>>;
  readonly config: Config;
}

// ---------------------------------------------------------------------------
// Incoming events
// ---------------------------------------------------------------------------

export type Event =
  /** An "incoming call" push, already through the native declarative mapper. JS takes no part. */
  | { type: 'PUSH_INCOMING'; callId: string; displayName?: string; handle?: string; hasVideo?: boolean }
  /** Transport-neutral cancel in the prototype; not permission for cancel-only PushKit pushes. */
  | { type: 'PUSH_CANCEL'; callId: string }
  /** An incoming call over an open socket — the app is alive by definition. */
  | { type: 'SIGNAL_INCOMING'; callId: string; displayName?: string; handle?: string; hasVideo?: boolean }
  | { type: 'START_CALL'; callId: string; displayName?: string; handle?: string; hasVideo?: boolean }
  /** Simplified OS observation; native must handle action/fulfill/fail before porting. */
  | { type: 'OS_ANSWER'; callId: string }
  | { type: 'OS_END'; callId: string }
  | { type: 'OS_HOLD'; callId: string; held: boolean }
  | { type: 'OS_MUTE'; callId: string; muted: boolean }
  /** Prototype for a CallKit provider reset; Android needs its own error/session lifecycle reconcile. */
  | { type: 'OS_PROVIDER_RESET' }
  /** Initiated by the app, from its in-app UI. */
  | { type: 'LOCAL_ANSWER'; callId: string }
  | { type: 'LOCAL_END'; callId: string; reason: EndReason }
  | { type: 'LOCAL_HOLD'; callId: string; held: boolean }
  | { type: 'LOCAL_MUTE'; callId: string; muted: boolean }
  /** From the app's signaling channel — events of the OTHER END. */
  | { type: 'REMOTE_ANSWERED'; callId: string }
  | { type: 'REMOTE_RINGING'; callId: string }
  | { type: 'REMOTE_ENDED'; callId: string; reason: EndReason }
  /** The OS refused to create the call. It will never ring. */
  | { type: 'OS_REPORT_FAILED'; callId: string; code: ReportFailureCode }
  /** A native timer. No platform does this by itself. */
  | { type: 'RING_TIMEOUT'; callId: string }
  /** Garbage collection: ended calls past retention, expired tombstones. */
  | { type: 'TICK' };

// ---------------------------------------------------------------------------
// Effects — work the native layer must do
// ---------------------------------------------------------------------------

export type Effect =
  /** Report an incoming call to the OS so it shows the UI and rings. */
  | { type: 'OS_REPORT_INCOMING'; callId: string; displayName?: string; handle?: string; hasVideo: boolean }
  /** Report an outgoing call to the OS. */
  | { type: 'OS_REPORT_OUTGOING'; callId: string; handle?: string; hasVideo: boolean }
  /** The other end answered — CallKit starts the call timer. */
  | { type: 'OS_REPORT_CONNECTED'; callId: string; at: number }
  /** Legacy iOS-oriented effect; null needs local-action handling, it is not a no-op. */
  | { type: 'OS_REPORT_ENDED'; callId: string; osReason: string | null; at: number }
  | { type: 'OS_SET_HELD'; callId: string; held: boolean }
  | { type: 'OS_SET_MUTED'; callId: string; muted: boolean }
  /**
   * Reject an incoming call before it even rings (busy, or already
   * tombstone).
   *
   * A domain rejection does not fulfil the PushKit obligation. Native must check the OS
   * metadata (iOS 26.4+) or the legacy reporting policy for every delivery, including duplicates.
   * mustReport=false does not turn VoIP pushes into a general cancel channel. The
   * required-report policy for stale/busy/duplicate needs device evidence before release.
   */
  | { type: 'REJECT_INCOMING'; callId: string; reason: EndReason; origin: CallOrigin }
  | { type: 'START_RING_TIMER'; callId: string; ms: number }
  | { type: 'CANCEL_RING_TIMER'; callId: string }
  /**
   * Emitted to JS. Queued natively if JS is not ready.
   * Carries the whole Call object rather than a few fields: the same shape as getCalls(),
   * so a `remoteRinging` change needs no separate event. `muted` still has its own
   * event because a mute action needs an immediate feedback path to the media adapter.
   */
  | { type: 'EMIT_STATE_CHANGED'; call: Call }
  | { type: 'EMIT_MUTED_CHANGED'; callId: string; muted: boolean }
  /** A rejected transition. Not an error — used for diagnostics. */
  | { type: 'IGNORED'; callId: string; eventType: Event['type']; why: string };

export interface Step {
  readonly registry: Registry;
  readonly effects: readonly Effect[];
}

export class ConfigError extends Error {}

export function validateConfig(c: Config): void {
  if (c.ringTimeoutMs <= 0) throw new ConfigError('ringTimeoutMs must be positive');
  if (c.tombstoneTtlMs <= 0) throw new ConfigError('tombstoneTtlMs must be positive');
  if (c.endedRetentionMs < 0) throw new ConfigError('endedRetentionMs must not be negative');
}

/** Live states — they occupy the slot and keep other calls out (v1 is single-call). */
export const LIVE_STATES: readonly CallState[] = ['incoming', 'outgoing', 'active', 'held'];

export function isLive(c: Call): boolean {
  return LIVE_STATES.includes(c.state);
}
