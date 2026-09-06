/**
 * Call lifecycle — shared data types.
 *
 * This is the executable specification of the state machine. The Swift and Kotlin layers must
 * go through exactly these states and transitions. When the two disagree, this
 * file is the arbiter.
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
 * Nine end reasons. The hardest thing to change later because they are written straight into the device's call
 * history — see `IOS_END_REASON` below.
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
 * `callerCancelled` and `unanswered` are two DIFFERENT reasons to the app, but
 * both map to CallKit's `unanswered` — the only way for iOS to show it
 * as a *missed call* in Recents. Using `remoteEnded` for a caller who
 * hangs up while it is ringing gives an ordinary ended call, and
 * the user loses track of the missed call.
 *
 * This is the example of the "one shape, mapped correctly per platform" thesis:
 * the app sees nine meaningful reasons, the platform sees exactly what it needs.
 */
export const IOS_END_REASON = {
  localHangup:       null,          // done by the user of this device → no report
  declined:          null,          // CallKit already knows via CXEndCallAction
  remoteEnded:       'remoteEnded',
  callerCancelled:   'unanswered',  // ← deliberate, see above
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
   * later. INVARIANT: must be greater than ringTimeoutMs — see `validateConfig`.
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
  /** A "cancel call" push, also from the mapper. Must work when the app has been killed. */
  | { type: 'PUSH_CANCEL'; callId: string }
  /** An incoming call over an open socket — the app is alive by definition. */
  | { type: 'SIGNAL_INCOMING'; callId: string; displayName?: string; handle?: string; hasVideo?: boolean }
  | { type: 'START_CALL'; callId: string; displayName?: string; handle?: string; hasVideo?: boolean }
  /** Operating system: the user pressed something in the OS UI. */
  | { type: 'OS_ANSWER'; callId: string }
  | { type: 'OS_END'; callId: string }
  | { type: 'OS_HOLD'; callId: string; held: boolean }
  | { type: 'OS_MUTE'; callId: string; muted: boolean }
  /** CallKit provider reset — every call dies. No Telecom equivalent. */
  | { type: 'OS_PROVIDER_RESET' }
  /** Initiated by the app, from its in-app UI. */
  | { type: 'LOCAL_ANSWER'; callId: string }
  | { type: 'LOCAL_END'; callId: string; reason: EndReason }
  | { type: 'LOCAL_HOLD'; callId: string; held: boolean }
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
  /** Tear down the call UI. A null `osReason` means the OS already knows. */
  | { type: 'OS_REPORT_ENDED'; callId: string; osReason: string | null; at: number }
  | { type: 'OS_SET_HELD'; callId: string; held: boolean }
  | { type: 'OS_SET_MUTED'; callId: string; muted: boolean }
  /**
   * Reject an incoming call before it even rings (busy, or already
   * tombstone).
   *
   * PLATFORM WARNING: when `origin` is 'push', iOS **still requires**
   * calling reportNewIncomingCall and then ending it at once — the PushKit rule applies to EVERY VoIP
   * push, with no exception for rejected ones. So this path STILL
   * flickers on iOS. A tombstone prevents endless ringing, not
   * the flicker. Android has no such constraint, so it can be dropped silently.
   */
  | { type: 'REJECT_INCOMING'; callId: string; reason: EndReason; origin: CallOrigin }
  | { type: 'START_RING_TIMER'; callId: string; ms: number }
  | { type: 'CANCEL_RING_TIMER'; callId: string }
  /**
   * Emitted to JS. Queued natively if JS is not ready.
   * Carries the whole Call object rather than a few fields: the same shape as getCalls(),
   * and property changes (remoteRinging, muted) need no separate event.
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
  if (c.tombstoneTtlMs <= c.ringTimeoutMs) {
    throw new ConfigError(
      `tombstoneTtlMs (${c.tombstoneTtlMs}) must be greater than ringTimeoutMs (${c.ringTimeoutMs}): ` +
        `otherwise a cancel arriving after the ring timeout loses its tombstone, and a late ` +
        `"incoming call" push rings the device for a call that was already cancelled.`,
    );
  }
  if (c.ringTimeoutMs <= 0) throw new ConfigError('ringTimeoutMs must be positive');
  if (c.endedRetentionMs < 0) throw new ConfigError('endedRetentionMs must not be negative');
}

/** Live states — they occupy the slot and keep other calls out (v1 is single-call). */
export const LIVE_STATES: readonly CallState[] = ['incoming', 'outgoing', 'active', 'held'];

export function isLive(c: Call): boolean {
  return LIVE_STATES.includes(c.state);
}
