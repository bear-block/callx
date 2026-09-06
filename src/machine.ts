/**
 * Call state machine — a pure function.
 *
 * No I/O, no timers, no mention of the platform. It takes the current state
 * plus an event, and returns the new state plus the list of work the native layer
 * must do. That way the whole lifecycle can be verified without a device, and
 * the Swift and Kotlin versions share one arbiter.
 *
 * INVARIANTS
 *  1. `ended` is terminal. The first writer wins — every end event arriving
 *     later is ignored. This is how the race between "the user declines" and
 *     "the caller cancels" happening at the same time is handled.
 *  2. Every entry into `ended` carries an `endReason`. No exceptions.
 *  3. v1 has only one live call at a time, but `callId` is present
 *     everywhere so extending it later is not a breaking change.
 *  4. A tombstone is recorded unconditionally on a cancel, even when the call does not
 *     exist yet — that is exactly its purpose.
 */

import {
  type Call,
  type CallOrigin,
  type Config,
  type EndReason,
  type Event,
  type Effect,
  type Registry,
  type Step,
  DEFAULT_CONFIG,
  IOS_END_REASON,
  isLive,
  validateConfig,
} from './types.ts';

export function createRegistry(config: Config = DEFAULT_CONFIG): Registry {
  validateConfig(config);
  return { calls: {}, tombstones: {}, config };
}

// --- helpers ------------------------------------------------------------------

function ignored(callId: string, e: Event, why: string): Effect {
  return { type: 'IGNORED', callId, eventType: e.type, why };
}

function put(reg: Registry, call: Call): Registry {
  return { ...reg, calls: { ...reg.calls, [call.id]: call } };
}

function liveCall(reg: Registry): Call | undefined {
  return Object.values(reg.calls).find(isLive);
}

/** Move to `ended` plus the accompanying effects. Applies invariants 1 and 2. */
function end(
  reg: Registry,
  call: Call,
  reason: EndReason,
  now: number,
  opts: { reportToOs: boolean; detail?: string },
): Step {
  const ended: Call = {
    ...call,
    state: 'ended',
    endReason: reason,
    endedAt: now,
    ...(opts.detail !== undefined ? { endDetail: opts.detail } : {}),
  };
  const effects: Effect[] = [{ type: 'CANCEL_RING_TIMER', callId: call.id }];

  if (opts.reportToOs) {
    effects.push({
      type: 'OS_REPORT_ENDED',
      callId: call.id,
      osReason: IOS_END_REASON[reason],
      at: now,
    });
  }
  effects.push({ type: 'EMIT_STATE_CHANGED', call: ended });
  return { registry: put(reg, ended), effects };
}

/** The shared entry for incoming calls, whether from a push or a socket. */
function admitIncoming(
  reg: Registry,
  e: Extract<Event, { type: 'PUSH_INCOMING' | 'SIGNAL_INCOMING' }>,
  origin: CallOrigin,
  now: number,
): Step {
  const tomb = reg.tombstones[e.callId];
  if (tomb !== undefined && tomb > now) {
    // Pushes arrived out of order: the cancel came first. Must not ring.
    return {
      registry: reg,
      effects: [{ type: 'REJECT_INCOMING', callId: e.callId, reason: 'callerCancelled', origin }],
    };
  }

  const existing = reg.calls[e.callId];
  if (existing !== undefined) {
    // A duplicate push — FCM and APNs can both deliver twice. Must be idempotent.
    return { registry: reg, effects: [ignored(e.callId, e, 'callId already exists')] };
  }

  const busy = liveCall(reg);
  if (busy !== undefined) {
    return {
      registry: reg,
      effects: [{ type: 'REJECT_INCOMING', callId: e.callId, reason: 'busy', origin }],
    };
  }

  const call: Call = {
    id: e.callId,
    direction: 'incoming',
    origin,
    state: 'incoming',
    hasVideo: e.hasVideo ?? false,
    muted: false,
    remoteRinging: false,
    createdAt: now,
    ...(e.displayName !== undefined ? { displayName: e.displayName } : {}),
    ...(e.handle !== undefined ? { handle: e.handle } : {}),
  };

  return {
    registry: put(reg, call),
    effects: [
      {
        type: 'OS_REPORT_INCOMING',
        callId: call.id,
        hasVideo: call.hasVideo,
        ...(call.displayName !== undefined ? { displayName: call.displayName } : {}),
        ...(call.handle !== undefined ? { handle: call.handle } : {}),
      },
      { type: 'START_RING_TIMER', callId: call.id, ms: reg.config.ringTimeoutMs },
      { type: 'EMIT_STATE_CHANGED', call },
    ],
  };
}

// --- reducer ----------------------------------------------------------------

export function reduce(reg: Registry, e: Event, now: number): Step {
  switch (e.type) {
    case 'PUSH_INCOMING':
      return admitIncoming(reg, e, 'push', now);

    case 'SIGNAL_INCOMING':
      return admitIncoming(reg, e, 'signal', now);

    case 'PUSH_CANCEL': {
      // Invariant 4: always record the tombstone, even when there is no call yet.
      const withTomb: Registry = {
        ...reg,
        tombstones: { ...reg.tombstones, [e.callId]: now + reg.config.tombstoneTtlMs },
      };
      const call = withTomb.calls[e.callId];
      if (call === undefined) {
        return { registry: withTomb, effects: [ignored(e.callId, e, 'no call yet — tombstone recorded')] };
      }
      if (!isLive(call)) {
        return { registry: withTomb, effects: [ignored(e.callId, e, 'the call has already ended')] };
      }
      const reason: EndReason = call.state === 'incoming' ? 'callerCancelled' : 'remoteEnded';
      return end(withTomb, call, reason, now, { reportToOs: true });
    }

    case 'START_CALL': {
      if (reg.calls[e.callId] !== undefined) {
        return { registry: reg, effects: [ignored(e.callId, e, 'callId already exists')] };
      }
      if (liveCall(reg) !== undefined) {
        return { registry: reg, effects: [ignored(e.callId, e, 'a call is already in progress (v1 is single-call)')] };
      }
      const call: Call = {
        id: e.callId,
        direction: 'outgoing',
        origin: 'local',
        state: 'outgoing',
        hasVideo: e.hasVideo ?? false,
        muted: false,
        remoteRinging: false,
        createdAt: now,
        ...(e.displayName !== undefined ? { displayName: e.displayName } : {}),
        ...(e.handle !== undefined ? { handle: e.handle } : {}),
      };
      return {
        registry: put(reg, call),
        effects: [
          {
            type: 'OS_REPORT_OUTGOING',
            callId: call.id,
            hasVideo: call.hasVideo,
            ...(call.handle !== undefined ? { handle: call.handle } : {}),
          },
          { type: 'EMIT_STATE_CHANGED', call },
        ],
      };
    }

    case 'OS_ANSWER':
    case 'LOCAL_ANSWER': {
      const call = reg.calls[e.callId];
      if (call === undefined) return { registry: reg, effects: [ignored(e.callId, e, 'no call')] };
      if (call.state !== 'incoming') {
        return { registry: reg, effects: [ignored(e.callId, e, `cannot answer from state ${call.state}`)] };
      }
      const active: Call = { ...call, state: 'active', connectedAt: now };
      return {
        registry: put(reg, active),
        effects: [
          { type: 'CANCEL_RING_TIMER', callId: call.id },
          { type: 'EMIT_STATE_CHANGED', call: active },
        ],
      };
    }

    case 'OS_END': {
      const call = reg.calls[e.callId];
      if (call === undefined) return { registry: reg, effects: [ignored(e.callId, e, 'no call')] };
      if (!isLive(call)) return { registry: reg, effects: [ignored(e.callId, e, 'already ended (first writer wins)')] };
      const reason: EndReason = call.state === 'incoming' ? 'declined' : 'localHangup';
      // The OS initiated it, so it already knows — do not report back.
      return end(reg, call, reason, now, { reportToOs: false });
    }

    case 'LOCAL_END': {
      const call = reg.calls[e.callId];
      if (call === undefined) return { registry: reg, effects: [ignored(e.callId, e, 'no call')] };
      if (!isLive(call)) return { registry: reg, effects: [ignored(e.callId, e, 'already ended (first writer wins)')] };
      return end(reg, call, e.reason, now, { reportToOs: true });
    }

    case 'REMOTE_ENDED': {
      const call = reg.calls[e.callId];
      if (call === undefined) return { registry: reg, effects: [ignored(e.callId, e, 'no call')] };
      if (!isLive(call)) return { registry: reg, effects: [ignored(e.callId, e, 'already ended (first writer wins)')] };
      // The most important path: events from the other end MUST be written back to the OS,
      // or the call UI hangs on the lock screen.
      return end(reg, call, e.reason, now, { reportToOs: true });
    }

    case 'REMOTE_ANSWERED': {
      const call = reg.calls[e.callId];
      if (call === undefined) return { registry: reg, effects: [ignored(e.callId, e, 'no call')] };
      if (call.state !== 'outgoing') {
        return { registry: reg, effects: [ignored(e.callId, e, `does not apply to state ${call.state}`)] };
      }
      const active: Call = { ...call, state: 'active', connectedAt: now };
      return {
        registry: put(reg, active),
        effects: [
          { type: 'OS_REPORT_CONNECTED', callId: call.id, at: now },
          { type: 'EMIT_STATE_CHANGED', call: active },
        ],
      };
    }

    case 'REMOTE_RINGING': {
      const call = reg.calls[e.callId];
      if (call === undefined) return { registry: reg, effects: [ignored(e.callId, e, 'no call')] };
      if (call.state !== 'outgoing') {
        return { registry: reg, effects: [ignored(e.callId, e, `does not apply to state ${call.state}`)] };
      }
      if (call.remoteRinging) return { registry: reg, effects: [ignored(e.callId, e, 'already ringing')] };
      // A property, not a state — the set of valid actions does not change.
      const ringing: Call = { ...call, remoteRinging: true };
      return { registry: put(reg, ringing), effects: [{ type: 'EMIT_STATE_CHANGED', call: ringing }] };
    }

    case 'OS_HOLD':
    case 'LOCAL_HOLD': {
      const call = reg.calls[e.callId];
      if (call === undefined) return { registry: reg, effects: [ignored(e.callId, e, 'no call')] };
      const want = e.held;
      if (want && call.state !== 'active') {
        return { registry: reg, effects: [ignored(e.callId, e, `cannot hold from state ${call.state}`)] };
      }
      if (!want && call.state !== 'held') {
        return { registry: reg, effects: [ignored(e.callId, e, `cannot resume from state ${call.state}`)] };
      }
      // CallKit CANNOT tell a user pressing hold from a GSM interruption —
      // both arrive as CXSetHeldCallAction. So OS_HOLD is recorded as 'system'.
      const heldBy = e.type === 'OS_HOLD' ? ('system' as const) : ('local' as const);
      const { heldBy: _previous, ...withoutHeldBy } = call;
      const next: Call = want
        ? { ...call, state: 'held', heldBy }
        : { ...withoutHeldBy, state: 'active' };
      const effects: Effect[] = [];
      // If the OS initiated it, it has already done it; if we initiated it, we must tell it.
      if (e.type === 'LOCAL_HOLD') effects.push({ type: 'OS_SET_HELD', callId: call.id, held: want });
      effects.push({ type: 'EMIT_STATE_CHANGED', call: next });
      return { registry: put(reg, next), effects };
    }

    case 'OS_MUTE': {
      const call = reg.calls[e.callId];
      if (call === undefined) return { registry: reg, effects: [ignored(e.callId, e, 'no call')] };
      if (!isLive(call)) return { registry: reg, effects: [ignored(e.callId, e, 'already ended')] };
      if (call.muted === e.muted) return { registry: reg, effects: [ignored(e.callId, e, 'unchanged')] };
      const next: Call = { ...call, muted: e.muted };
      return {
        registry: put(reg, next),
        effects: [{ type: 'EMIT_MUTED_CHANGED', callId: call.id, muted: e.muted }],
      };
    }

    case 'OS_REPORT_FAILED': {
      const call = reg.calls[e.callId];
      if (call === undefined) return { registry: reg, effects: [ignored(e.callId, e, 'no call')] };
      if (!isLive(call)) return { registry: reg, effects: [ignored(e.callId, e, 'already ended')] };
      // The OS never managed to create the call → nothing to tear down, do not report back.
      // But the app MUST know, so it can tell the server that
      // the call could not be delivered — otherwise the other end rings forever.
      return end(reg, call, 'failed', now, { reportToOs: false, detail: e.code });
    }

    case 'RING_TIMEOUT': {
      const call = reg.calls[e.callId];
      if (call === undefined) return { registry: reg, effects: [ignored(e.callId, e, 'no call')] };
      if (call.state !== 'incoming') {
        return { registry: reg, effects: [ignored(e.callId, e, `timed out but in ${call.state}`)] };
      }
      return end(reg, call, 'unanswered', now, { reportToOs: true });
    }

    case 'OS_PROVIDER_RESET': {
      // CallKit reset — every call disappears from the OS. Do not report back.
      let next = reg;
      const effects: Effect[] = [];
      for (const call of Object.values(reg.calls)) {
        if (!isLive(call)) continue;
        const step = end(next, call, 'failed', now, { reportToOs: false });
        next = step.registry;
        effects.push(...step.effects);
      }
      return { registry: next, effects };
    }

    case 'TICK': {
      const calls: Record<string, Call> = {};
      for (const [id, call] of Object.entries(reg.calls)) {
        const expired =
          call.state === 'ended' &&
          call.endedAt !== undefined &&
          now - call.endedAt >= reg.config.endedRetentionMs;
        if (!expired) calls[id] = call;
      }
      const tombstones: Record<string, number> = {};
      for (const [id, exp] of Object.entries(reg.tombstones)) {
        if (exp > now) tombstones[id] = exp;
      }
      return { registry: { ...reg, calls, tombstones }, effects: [] };
    }
  }
}

/** A helper for tests and the bridge layer: run a sequence of events. */
export function run(
  reg: Registry,
  events: readonly { event: Event; now: number }[],
): { registry: Registry; effects: Effect[] } {
  let r = reg;
  const all: Effect[] = [];
  for (const { event, now } of events) {
    const step = reduce(r, event, now);
    r = step.registry;
    all.push(...step.effects);
  }
  return { registry: r, effects: all };
}
