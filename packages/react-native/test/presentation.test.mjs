import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CallxPresentationController} from '../lib/presentation.js';
const call = (state, callId = 'one') => ({callId, state});
test('incoming stays hidden; accept or recovery presents once; minimize survives media updates', () => {
  const ui = new CallxPresentationController();
  ui.update(call('incoming')); ui.expand(); ui.minimize();
  assert.equal(ui.mode, 'hidden');
  ui.update(call('connecting')); assert.equal(ui.mode, 'expanded');
  ui.minimize(); ui.update(call('active')); ui.update(call('held'));
  assert.equal(ui.mode, 'minimized');
  ui.expand(); assert.equal(ui.mode, 'expanded');
  ui.update(call('ended')); ui.expand(); assert.equal(ui.mode, 'hidden');
  ui.update(call('incoming', 'two')); assert.equal(ui.mode, 'hidden');
  ui.update(call('active', 'two')); assert.equal(ui.mode, 'expanded');
  ui.update(null); assert.equal(ui.mode, 'hidden');
});
test('outgoing presents immediately and a new call resets minimized state', () => {
  const ui = new CallxPresentationController();
  ui.update(call('outgoing')); assert.equal(ui.mode, 'expanded');
  ui.minimize(); ui.update(call('outgoing', 'two')); assert.equal(ui.mode, 'expanded');
});
