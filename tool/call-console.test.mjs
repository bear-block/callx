import assert from 'node:assert/strict';
import test from 'node:test';
import { createConsole, statusFrom } from './call-console.mjs';

function harness() {
  let clock = 1_000;
  const sent = [];
  const console_ = createConsole({
    now: () => clock,
    send: async (options) => { sent.push(options); return { status: 200, callId: options.callId ?? 'call-1' }; },
  });
  const report = (...messages) => console_.report({ app: 'flutter', model: 'Pixel', token: 'fcm-1',
    events: messages.map((message) => `10:00:00  ${message}`).reverse() });
  return { console_, sent, report, advance: (ms) => { clock += ms; } };
}

test('host log lines map to call statuses', () => {
  assert.equal(statusFrom('push for call-1: priority 1, original 1'), 'delivered');
  assert.equal(statusFrom('ringing call-1 (hao.dev7)'), 'ringing');
  assert.equal(statusFrom('did not ring call-1: expired'), 'notRung');
  assert.equal(statusFrom('answered from notification: call-1'), 'answered');
  assert.equal(statusFrom('system surface ended call-1: 2'), 'ended');
  assert.equal(statusFrom('media connected (simulated) for call-1'), 'active');
  assert.equal(statusFrom('FCM token ready'), null);
});

test('an invitation is tracked through the device log and stays ended', async () => {
  const { console_, sent, report } = harness();
  report('FCM token ready');
  const device = console_.snapshot().devices[0];
  assert.equal(device.token, 'fcm-1');
  await console_.invite({ device: device.key, name: 'hao.dev7', expiresIn: 30 });
  assert.equal(sent[0].token, 'fcm-1');
  report('FCM token ready', 'push for call-1: priority 1, original 1', 'ringing call-1 (hao.dev7)');
  assert.equal(console_.snapshot().calls[0].status, 'ringing');
  report('FCM token ready', 'push for call-1: priority 1, original 1', 'ringing call-1 (hao.dev7)',
    'ended from notification: call-1', 'answered from notification: call-1');
  const call = console_.snapshot().calls[0];
  assert.equal(call.status, 'ended');
  // Lines already reported once are not repeated in the timeline.
  assert.equal(call.timeline.filter((entry) => entry.text.startsWith('ringing')).length, 1);
});

test('signals reach the invited device and undelivered invitations expire', async () => {
  const { console_, sent, report, advance } = harness();
  report();
  await console_.invite({ device: console_.snapshot().devices[0].key, expiresIn: 5 });
  await console_.signal({ callId: 'call-1', message: 'end', reason: 'callerCancelled' });
  assert.deepEqual(sent[1], { token: 'fcm-1', callId: 'call-1', message: 'end', reason: 'callerCancelled' });
  advance(6_000);
  assert.equal(console_.snapshot().calls[0].status, 'expired');
  assert.equal(console_.snapshot().devices[0].online, false);
});

test('invites need a device with a token', async () => {
  const { console_ } = harness();
  await assert.rejects(console_.invite({ device: 'missing' }), /FCM token/);
});
