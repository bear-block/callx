import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { createRegistry, reduce, run } from './machine.ts';
import {
  type Call,
  type Effect,
  type Registry,
  ConfigError,
  DEFAULT_CONFIG,
  IOS_END_REASON,
  validateConfig,
} from './types.ts';

const T0 = 1_000_000;

function call(reg: Registry, id: string): Call {
  const c = reg.calls[id];
  assert.ok(c, `call ${id} not found`);
  return c;
}

function has(effects: readonly Effect[], type: Effect['type']): boolean {
  return effects.some((f) => f.type === type);
}

function find<T extends Effect['type']>(
  effects: readonly Effect[],
  type: T,
): Extract<Effect, { type: T }> {
  const f = effects.find((x) => x.type === type);
  assert.ok(f, `missing effect ${type}`);
  return f as Extract<Effect, { type: T }>;
}

/** An incoming call that is ringing — the starting point of most scenarios. */
function ringing(id = 'c1') {
  const reg = createRegistry();
  return reduce(reg, { type: 'PUSH_INCOMING', callId: id, displayName: 'hao.dev7' }, T0);
}

// ---------------------------------------------------------------------------

describe('Core matrix — scenarios', () => {
  test('S-01 · incoming → answer → hang up', () => {
    const a = ringing();
    assert.equal(call(a.registry, 'c1').state, 'incoming');
    assert.ok(has(a.effects, 'OS_REPORT_INCOMING'));
    assert.ok(has(a.effects, 'START_RING_TIMER'));

    const b = reduce(a.registry, { type: 'OS_ANSWER', callId: 'c1' }, T0 + 3000);
    assert.equal(call(b.registry, 'c1').state, 'active');
    assert.equal(call(b.registry, 'c1').connectedAt, T0 + 3000);
    assert.ok(has(b.effects, 'CANCEL_RING_TIMER'));

    const c = reduce(b.registry, { type: 'OS_END', callId: 'c1' }, T0 + 60_000);
    assert.equal(call(c.registry, 'c1').state, 'ended');
    assert.equal(call(c.registry, 'c1').endReason, 'localHangup');
    // The OS initiated it → no report back
    assert.equal(has(c.effects, 'OS_REPORT_ENDED'), false);
  });

  test('S-02 · decline while ringing', () => {
    const a = ringing();
    const b = reduce(a.registry, { type: 'OS_END', callId: 'c1' }, T0 + 2000);
    assert.equal(call(b.registry, 'c1').endReason, 'declined');
  });

  test('S-03 · nobody answers → timeout → missed', () => {
    const a = ringing();
    const b = reduce(a.registry, { type: 'RING_TIMEOUT', callId: 'c1' }, T0 + 45_000);
    assert.equal(call(b.registry, 'c1').endReason, 'unanswered');
    assert.equal(find(b.effects, 'OS_REPORT_ENDED').osReason, 'unanswered');
  });

  test('S-04 · caller cancels while ringing — the most important scenario', () => {
    const a = ringing();
    const b = reduce(a.registry, { type: 'PUSH_CANCEL', callId: 'c1' }, T0 + 4000);

    assert.equal(call(b.registry, 'c1').state, 'ended');
    assert.equal(call(b.registry, 'c1').endReason, 'callerCancelled');
    // Must be written back to the OS, or the UI hangs on the lock screen
    assert.equal(find(b.effects, 'OS_REPORT_ENDED').osReason, 'unanswered');
    // A tombstone is recorded to block late pushes
    assert.ok(b.registry.tombstones['c1']! > T0 + 4000);
  });

  test('S-05 · the other end hangs up mid-call — must be written back to the OS', () => {
    const a = ringing();
    const b = reduce(a.registry, { type: 'OS_ANSWER', callId: 'c1' }, T0 + 1000);
    const c = reduce(b.registry, { type: 'REMOTE_ENDED', callId: 'c1', reason: 'remoteEnded' }, T0 + 30_000);

    assert.equal(call(c.registry, 'c1').endReason, 'remoteEnded');
    assert.equal(find(c.effects, 'OS_REPORT_ENDED').osReason, 'remoteEnded');
  });

  test('S-06 · outgoing → the other end rings → answers → hang up', () => {
    const reg = createRegistry();
    const a = reduce(reg, { type: 'START_CALL', callId: 'o1', handle: '+8490' }, T0);
    assert.equal(call(a.registry, 'o1').state, 'outgoing');
    assert.equal(call(a.registry, 'o1').remoteRinging, false);

    const b = reduce(a.registry, { type: 'REMOTE_RINGING', callId: 'o1' }, T0 + 1000);
    // The property changes, the state stays
    assert.equal(call(b.registry, 'o1').state, 'outgoing');
    assert.equal(call(b.registry, 'o1').remoteRinging, true);

    const c = reduce(b.registry, { type: 'REMOTE_ANSWERED', callId: 'o1' }, T0 + 8000);
    assert.equal(call(c.registry, 'o1').state, 'active');
    // CallKit needs this milestone to start the call timer
    assert.equal(find(c.effects, 'OS_REPORT_CONNECTED').at, T0 + 8000);
  });

  test('S-07 · outgoing call hits busy', () => {
    const reg = createRegistry();
    const a = reduce(reg, { type: 'START_CALL', callId: 'o1' }, T0);
    const b = reduce(a.registry, { type: 'REMOTE_ENDED', callId: 'o1', reason: 'busy' }, T0 + 2000);
    assert.equal(call(b.registry, 'o1').endReason, 'busy');
    assert.equal(find(b.effects, 'OS_REPORT_ENDED').osReason, 'failed');
  });

  test('S-08 · hold then resume, initiated by the app', () => {
    const a = ringing();
    const b = reduce(a.registry, { type: 'OS_ANSWER', callId: 'c1' }, T0 + 1000);

    const held = reduce(b.registry, { type: 'LOCAL_HOLD', callId: 'c1', held: true }, T0 + 5000);
    assert.equal(call(held.registry, 'c1').state, 'held');
    assert.equal(call(held.registry, 'c1').heldBy, 'local');
    // We initiated it → we must tell the OS
    assert.equal(find(held.effects, 'OS_SET_HELD').held, true);

    const back = reduce(held.registry, { type: 'LOCAL_HOLD', callId: 'c1', held: false }, T0 + 9000);
    assert.equal(call(back.registry, 'c1').state, 'active');
    assert.equal(call(back.registry, 'c1').heldBy, undefined);
  });

  test('S-09 · mute is a property, not a state', () => {
    const a = ringing();
    const b = reduce(a.registry, { type: 'OS_ANSWER', callId: 'c1' }, T0 + 1000);
    const c = reduce(b.registry, { type: 'OS_MUTE', callId: 'c1', muted: true }, T0 + 2000);

    assert.equal(call(c.registry, 'c1').state, 'active', 'mute must not change the state');
    assert.equal(call(c.registry, 'c1').muted, true);
    assert.ok(has(c.effects, 'EMIT_MUTED_CHANGED'));
    assert.equal(has(c.effects, 'EMIT_STATE_CHANGED'), false);
  });

  test('S-10 · an interrupting GSM call — the OS forces hold', () => {
    const a = ringing();
    const b = reduce(a.registry, { type: 'OS_ANSWER', callId: 'c1' }, T0 + 1000);
    const c = reduce(b.registry, { type: 'OS_HOLD', callId: 'c1', held: true }, T0 + 5000);

    assert.equal(call(c.registry, 'c1').state, 'held');
    // CallKit cannot tell a user pressing hold from a GSM interruption
    assert.equal(call(c.registry, 'c1').heldBy, 'system');
    // The OS already did it → do not tell it to do it again
    assert.equal(has(c.effects, 'OS_SET_HELD'), false);
  });

  test('S-11 · pushes arrive out of order — the tombstone prevents the ring', () => {
    const reg = createRegistry();
    const cancelled = reduce(reg, { type: 'PUSH_CANCEL', callId: 'c9' }, T0);
    assert.equal(cancelled.registry.calls['c9'], undefined);

    const late = reduce(cancelled.registry, { type: 'PUSH_INCOMING', callId: 'c9' }, T0 + 500);
    assert.equal(late.registry.calls['c9'], undefined, 'a cancelled call must not be created');
    assert.equal(has(late.effects, 'OS_REPORT_INCOMING'), false, 'must not ring');

    const reject = find(late.effects, 'REJECT_INCOMING');
    assert.equal(reject.reason, 'callerCancelled');
    assert.equal(reject.origin, 'push', 'the origin decides whether iOS forces a flicker');
  });

  test('S-11b · once the tombstone expires, a new push rings normally again', () => {
    const reg = createRegistry();
    const cancelled = reduce(reg, { type: 'PUSH_CANCEL', callId: 'c9' }, T0);
    const afterTtl = T0 + DEFAULT_CONFIG.tombstoneTtlMs + 1;
    const swept = reduce(cancelled.registry, { type: 'TICK' }, afterTtl);
    const fresh = reduce(swept.registry, { type: 'PUSH_INCOMING', callId: 'c9' }, afterTtl);
    assert.ok(has(fresh.effects, 'OS_REPORT_INCOMING'));
  });
});

describe('Invariants', () => {
  test('ended is terminal — the first writer wins', () => {
    // The user declines exactly as the caller cancels
    const a = ringing();
    const declined = reduce(a.registry, { type: 'OS_END', callId: 'c1' }, T0 + 4000);
    assert.equal(call(declined.registry, 'c1').endReason, 'declined');

    const race = reduce(declined.registry, { type: 'PUSH_CANCEL', callId: 'c1' }, T0 + 4001);
    assert.equal(call(race.registry, 'c1').endReason, 'declined', 'the first reason must win');
    assert.ok(has(race.effects, 'IGNORED'));
    // …but the tombstone must still be recorded
    assert.ok(race.registry.tombstones['c1'] !== undefined);
  });

  test('every entry into ended has a reason', () => {
    const paths = [
      () => reduce(ringing().registry, { type: 'OS_END', callId: 'c1' }, T0 + 1),
      () => reduce(ringing().registry, { type: 'PUSH_CANCEL', callId: 'c1' }, T0 + 1),
      () => reduce(ringing().registry, { type: 'RING_TIMEOUT', callId: 'c1' }, T0 + 1),
      () => reduce(ringing().registry, { type: 'REMOTE_ENDED', callId: 'c1', reason: 'failed' }, T0 + 1),
      () => reduce(ringing().registry, { type: 'LOCAL_END', callId: 'c1', reason: 'declined' }, T0 + 1),
      () => reduce(ringing().registry, { type: 'OS_PROVIDER_RESET' }, T0 + 1),
    ];
    for (const p of paths) {
      const c = call(p().registry, 'c1');
      assert.equal(c.state, 'ended');
      assert.ok(c.endReason, 'missing endReason');
      assert.ok(c.endedAt);
    }
  });

  test('a duplicate push is idempotent — FCM/APNs may deliver twice', () => {
    const a = ringing();
    const b = reduce(a.registry, { type: 'PUSH_INCOMING', callId: 'c1', displayName: 'Other' }, T0 + 100);
    assert.equal(call(b.registry, 'c1').displayName, 'hao.dev7', 'must not be overwritten');
    assert.equal(has(b.effects, 'OS_REPORT_INCOMING'), false, 'must not be reported twice');
  });

  test('a second call is rejected as busy (v1 is single-call)', () => {
    const a = ringing('c1');
    const b = reduce(a.registry, { type: 'OS_ANSWER', callId: 'c1' }, T0 + 1000);
    const second = reduce(b.registry, { type: 'PUSH_INCOMING', callId: 'c2' }, T0 + 2000);

    assert.equal(second.registry.calls['c2'], undefined);
    assert.equal(find(second.effects, 'REJECT_INCOMING').reason, 'busy');
  });

  test('callerCancelled maps to unanswered so it shows as a missed call', () => {
    assert.equal(IOS_END_REASON.callerCancelled, 'unanswered');
    assert.notEqual(IOS_END_REASON.callerCancelled, 'remoteEnded');
  });

  test('a CallKit provider reset kills every call without reporting back', () => {
    const a = ringing();
    const b = reduce(a.registry, { type: 'OS_PROVIDER_RESET' }, T0 + 5000);
    assert.equal(call(b.registry, 'c1').endReason, 'failed');
    assert.equal(has(b.effects, 'OS_REPORT_ENDED'), false, 'the provider is gone');
  });

  test('the OS refuses to create the call (DND, block list) — must not hang in incoming', () => {
    const a = ringing();
    const b = reduce(a.registry, { type: 'OS_REPORT_FAILED', callId: 'c1', code: 'doNotDisturb' }, T0 + 200);

    assert.equal(call(b.registry, 'c1').state, 'ended', 'must not be stuck in incoming');
    assert.equal(call(b.registry, 'c1').endReason, 'failed');
    assert.equal(call(b.registry, 'c1').endDetail, 'doNotDisturb');
    // The OS created nothing → there is no UI to tear down
    assert.equal(has(b.effects, 'OS_REPORT_ENDED'), false);
    // …but the app must know, to tell the server, or the other end rings forever
    assert.ok(has(b.effects, 'EMIT_STATE_CHANGED'));
  });

  test('an ended call stays observable during retention, then is cleaned up', () => {
    const a = ringing();
    const b = reduce(a.registry, { type: 'OS_END', callId: 'c1' }, T0 + 1000);

    const early = reduce(b.registry, { type: 'TICK' }, T0 + 1000 + DEFAULT_CONFIG.endedRetentionMs - 1);
    assert.ok(early.registry.calls['c1'], 'JS waking up late must still see it');

    const late = reduce(b.registry, { type: 'TICK' }, T0 + 1000 + DEFAULT_CONFIG.endedRetentionMs + 1);
    assert.equal(late.registry.calls['c1'], undefined);
  });

  test('an ended call cannot be answered', () => {
    const a = ringing();
    const b = reduce(a.registry, { type: 'OS_END', callId: 'c1' }, T0 + 1000);
    const c = reduce(b.registry, { type: 'OS_ANSWER', callId: 'c1' }, T0 + 2000);
    assert.equal(call(c.registry, 'c1').state, 'ended');
    assert.ok(has(c.effects, 'IGNORED'));
  });

  test('an event for a callId that does not exist does not crash the state machine', () => {
    const reg = createRegistry();
    const out = run(reg, [
      { event: { type: 'OS_ANSWER', callId: 'ma' }, now: T0 },
      { event: { type: 'REMOTE_ENDED', callId: 'ma', reason: 'failed' }, now: T0 },
      { event: { type: 'OS_HOLD', callId: 'ma', held: true }, now: T0 },
      { event: { type: 'RING_TIMEOUT', callId: 'ma' }, now: T0 },
    ]);
    assert.equal(Object.keys(out.registry.calls).length, 0);
    assert.equal(out.effects.every((f) => f.type === 'IGNORED'), true);
  });
});

describe('Configuration', () => {
  test('the tombstone must outlive the ring time', () => {
    assert.throws(
      () => validateConfig({ ringTimeoutMs: 60_000, tombstoneTtlMs: 30_000, endedRetentionMs: 1000 }),
      ConfigError,
    );
    assert.doesNotThrow(() => validateConfig(DEFAULT_CONFIG));
  });

  test('the defaults satisfy the invariants', () => {
    assert.ok(DEFAULT_CONFIG.tombstoneTtlMs > DEFAULT_CONFIG.ringTimeoutMs);
  });
});
