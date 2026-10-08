import assert from 'node:assert/strict';
import test from 'node:test';
import { createCalls } from './calls.mjs';
import { fcmMessage } from './push.mjs';
import { createBackend } from './server.mjs';

function setup() {
  let clock = 1_000_000;
  let ids = 0;
  const pushes = [];
  const timers = [];
  const calls = createCalls({
    now: () => clock, ringMs: 30_000, newId: () => `id-${++ids}`,
    push: (message) => pushes.push(message),
    schedule: (atMs, fn) => timers.push({ atMs, fn }),
  });
  calls.registerPushToken('alice', 'alice-phone', 'fcm', 'token-a');
  calls.registerPushToken('bob', 'bob-phone', 'fcm', 'token-b1');
  calls.registerPushToken('bob', 'bob-tablet', 'voip', 'token-b2');
  const advance = (ms) => {
    clock += ms;
    for (const timer of timers.splice(0)) if (timer.atMs <= clock) timer.fn(); else timers.push(timer);
  };
  const types = (installationId) => calls.eventsFor(installationId).events.map((event) => `${event.type}:${event.reason ?? ''}`);
  return { calls, pushes, advance, types };
}

test('creating a call pushes the invitation to every callee device', () => {
  const { calls, pushes } = setup();
  const call = calls.createCall('alice', 'alice-phone', { callId: 'c1', calleeUserId: 'bob' });
  assert.equal(call.state, 'ringing');
  assert.deepEqual(pushes.map((push) => [push.installation.installationId, push.priority, push.payload.type]),
    [['bob-phone', 'high', 'call.invited'], ['bob-tablet', 'high', 'call.invited']]);
  assert.equal(pushes[0].payload.displayName, 'alice');
  assert.equal(pushes[0].payload.expiresAtMs, 1_030_000);
});

test('a retried create returns the same call; reusing the ID for another call is refused', () => {
  const { calls } = setup();
  calls.createCall('alice', 'alice-phone', { callId: 'c1', calleeUserId: 'bob' });
  assert.equal(calls.createCall('alice', 'alice-phone', { callId: 'c1', calleeUserId: 'bob' }).callId, 'c1');
  calls.registerPushToken('carol', 'carol-phone', 'fcm', 'token-c');
  assert.throws(() => calls.createCall('alice', 'alice-phone', { callId: 'c1', calleeUserId: 'carol' }), { status: 409 });
});

test('the first token request wins the answer; the other device ends as answeredElsewhere', () => {
  const { calls, pushes, types } = setup();
  calls.createCall('alice', 'alice-phone', { callId: 'c1', calleeUserId: 'bob' });
  assert.throws(() => calls.claimMedia('alice', 'alice-phone', 'c1'), { status: 409 }); // not accepted yet

  const media = calls.claimMedia('bob', 'bob-tablet', 'c1');
  assert.deepEqual(media, { room: 'call-c1', identity: 'bob:bob-tablet' });
  assert.deepEqual(types('alice-phone'), ['call.accepted:']);
  assert.deepEqual(types('bob-phone'), ['call.ended:answeredElsewhere']);
  assert.deepEqual(types('bob-tablet'), []);
  assert.equal(pushes.at(-1).priority, 'normal'); // the Android signal stops a phone without a running app

  assert.throws(() => calls.claimMedia('bob', 'bob-phone', 'c1'), { status: 409 });
  assert.deepEqual(calls.claimMedia('bob', 'bob-tablet', 'c1'), media); // a retry
  assert.equal(calls.claimMedia('alice', 'alice-phone', 'c1').room, 'call-c1');
});

test('the caller cancelling stops every callee device', () => {
  const { calls, types } = setup();
  calls.createCall('alice', 'alice-phone', { callId: 'c1', calleeUserId: 'bob' });
  assert.equal(calls.endCall('alice', 'alice-phone', 'c1', 'localHangup').endReason, 'localHangup');
  assert.deepEqual(types('bob-phone'), ['call.ended:callerCancelled']);
  assert.deepEqual(types('bob-tablet'), ['call.ended:callerCancelled']);
  assert.throws(() => calls.claimMedia('bob', 'bob-phone', 'c1'), { status: 410 });
});

test('a decline tells the caller and stops the callee\'s other devices', () => {
  const { calls, types } = setup();
  calls.createCall('alice', 'alice-phone', { callId: 'c1', calleeUserId: 'bob' });
  calls.endCall('bob', 'bob-phone', 'c1', 'declined');
  assert.deepEqual(types('alice-phone'), ['call.ended:declined']);
  assert.deepEqual(types('bob-tablet'), ['call.ended:declinedElsewhere']);
  assert.deepEqual(types('bob-phone'), []);
});

test('a hang-up after the answer reaches only the other participant, once', () => {
  const { calls, types } = setup();
  calls.createCall('alice', 'alice-phone', { callId: 'c1', calleeUserId: 'bob' });
  calls.claimMedia('bob', 'bob-phone', 'c1');
  calls.endCall('bob', 'bob-tablet', 'c1', 'localHangup'); // the device that lost changes nothing
  calls.endCall('alice', 'alice-phone', 'c1', 'localHangup');
  calls.endCall('bob', 'bob-phone', 'c1', 'localHangup'); // both hung up at once
  assert.deepEqual(types('bob-phone'), ['call.ended:remoteEnded']);
  assert.deepEqual(types('bob-tablet'), ['call.ended:answeredElsewhere']);
  assert.equal(calls.getCall('bob', 'c1').endReason, 'localHangup');
});

test('an unanswered call ends at its expiry on every side', () => {
  const { calls, advance, types } = setup();
  calls.createCall('alice', 'alice-phone', { callId: 'c1', calleeUserId: 'bob' });
  advance(29_000);
  assert.equal(calls.getCall('alice', 'c1').state, 'ringing');
  advance(1_000);
  assert.equal(calls.getCall('alice', 'c1').endReason, 'unanswered');
  assert.deepEqual(types('alice-phone'), ['call.ended:unanswered']);
  assert.deepEqual(types('bob-tablet'), ['call.ended:unanswered']);
});

test('events carry increasing revisions and a cursor', () => {
  const { calls } = setup();
  calls.createCall('alice', 'alice-phone', { callId: 'c1', calleeUserId: 'bob' });
  calls.claimMedia('bob', 'bob-phone', 'c1');
  calls.endCall('bob', 'bob-phone', 'c1', 'localHangup');
  const all = calls.eventsFor('alice-phone');
  assert.deepEqual(all.events.map((event) => event.revision), ['2', '3']);
  assert.equal(all.cursor, 2);
  assert.deepEqual(calls.eventsFor('alice-phone', 1).events.map((event) => event.type), ['call.ended']);
  assert.deepEqual(calls.eventsFor('alice-phone', 2).events, []);
});

test('only participants see a call', () => {
  const { calls } = setup();
  calls.createCall('alice', 'alice-phone', { callId: 'c1', calleeUserId: 'bob' });
  assert.throws(() => calls.getCall('mallory', 'c1'), { status: 404 });
  assert.throws(() => calls.claimMedia('mallory', 'm-phone', 'c1'), { status: 404 });
});

test('the FCM message holds an invitation until it expires', () => {
  const message = fcmMessage('t', { type: 'call.invited', expiresAtMs: 31_000 }, 'high', 1_000);
  assert.deepEqual(message.message.android, { priority: 'HIGH', ttl: '30s' });
  assert.equal(JSON.parse(message.message.data.callx).type, 'call.invited');
  assert.equal(fcmMessage('t', { type: 'call.ended' }, 'normal').message.android.priority, 'NORMAL');
});

test('over HTTP: register, call, answer through the token request, hang up', async (t) => {
  const pushes = [];
  const { server } = createBackend({
    push: async (message) => { pushes.push(message); },
    livekit: { url: 'ws://livekit.test', apiKey: 'devkey', apiSecret: 'secret' },
    log: () => {},
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const api = async (method, path, user, installation, body) => {
    const response = await fetch(base + path, { method, body: body && JSON.stringify(body),
      headers: { authorization: `Bearer ${user}`, 'x-installation-id': installation, 'content-type': 'application/json' } });
    return { status: response.status, body: response.status === 204 ? null : await response.json() };
  };

  assert.equal((await api('PUT', '/v1/installations/a1/push-token', 'alice', 'a1', { type: 'fcm', token: 'ta' })).status, 204);
  assert.equal((await api('PUT', '/v1/installations/b1/push-token', 'bob', 'b1', { type: 'voip', token: 'tb' })).status, 204);
  assert.equal((await api('POST', '/v1/calls', 'alice', 'a1', { callId: 'c1', calleeUserId: 'bob' })).status, 201);
  assert.equal(pushes[0].installation.installationId, 'b1');

  const waiting = api('GET', '/v1/call-events?cursor=0&wait=5', 'alice', 'a1'); // the caller's long poll
  const media = await api('POST', '/v1/media-token', 'bob', 'b1', { callId: 'c1' });
  assert.equal(media.status, 200);
  assert.equal(media.body.url, 'ws://livekit.test');
  assert.equal(media.body.token.split('.').length, 3);
  const accepted = await waiting;
  assert.deepEqual(accepted.body.events.map((event) => event.type), ['call.accepted']);

  assert.equal((await api('POST', '/v1/calls/c1/end', 'alice', 'a1', { reason: 'localHangup' })).body.state, 'ended');
  const ended = await api('GET', '/v1/call-events?cursor=0&wait=0', 'bob', 'b1');
  assert.deepEqual(ended.body.events.map((event) => [event.type, event.reason]), [['call.ended', 'remoteEnded']]);
  assert.equal((await api('GET', '/v1/calls/c1', 'bob', 'b1')).body.state, 'ended');
  assert.equal((await api('GET', '/v1/calls/c1', 'bob', '')).status, 200);
  assert.equal((await fetch(`${base}/v1/calls/c1`)).status, 401);
});
