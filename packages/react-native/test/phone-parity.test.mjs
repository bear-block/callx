import test from 'node:test';
import assert from 'node:assert/strict';
import {Callx} from '../lib/index.js';
import {createCallxPreview} from '../lib/preview.js';
import {NativeCallxBackend} from '../lib/native.js';

test('phone commands preserve arguments and operation identity across the native boundary', async () => {
  const received = [];
  const callx = new Callx({execute: async command => { received.push(command); return {status:'applied'}; }});
  await callx.setAudioRoute('call-1', 'bluetooth-1', {operationId:'route'});
  await callx.sendDtmf('call-1', '*12#', {operationId:'tone'});
  await callx.setDisplayName('call-1', 'Steven', {operationId:'name'});
  assert.deepEqual(received.map(({type, value, operationId}) => [type, value, operationId]),
    [['setAudioRoute','bluetooth-1','route'], ['sendDtmf','*12#','tone'], ['setDisplayName','Steven','name']]);
  assert.ok(received.every(command => command.contractVersion === '0.3.0'));
});

test('routes clear on end; tones preserve call state and obey active-only validation', async () => {
  const {callx, simulator} = createCallxPreview();
  await callx.setup();
  await simulator.incoming({callId:'call-1', displayName:'Steven', handle:'steven'});
  await assert.rejects(callx.sendDtmf('call-1', '1'), {code:'invalidState'});
  await callx.answer('call-1'); await simulator.mediaConnected();
  await simulator.audioRoutes([{id:'speaker', kind:'speaker', name:'Speaker'}], 'speaker');
  await assert.rejects(callx.setAudioRoute('call-1', 'gone'), {code:'invalidArgument'});
  const before = (await callx.getSnapshot()).call;
  const session = await callx.openSession(); const events = [];
  const off = callx.observeEvents(session.sessionId, event => events.push(event.kind));
  await callx.sendDtmf('call-1', '*12#');
  assert.deepEqual((await callx.getSnapshot()).call, before);
  assert.deepEqual(events, ['operationCompleted']);
  await assert.rejects(callx.sendDtmf('call-1', 'a'), {code:'invalidArgument'});
  await callx.setDisplayName('call-1', 'hao.dev7');
  assert.equal((await callx.getSnapshot()).call.displayName, 'hao.dev7');
  await callx.end('call-1');
  assert.equal((await callx.getSnapshot()).call.audioRoutes, undefined);
  assert.equal((await callx.getSnapshot()).call.audioRoute, undefined);
  off(); callx.dispose();
});

test('call requests deliver pending and live requests without opening a call session', async () => {
  const pending = {handle:'steven', video:true}; let event; let removed = false;
  let released = 0;
  const module = {async takeCallRequest() { return pending; }, releaseCallRequests() { released++; }};
  class Emitter { addListener(name, listener) {
    assert.equal(name, 'callxCallRequest'); event = listener;
    return {remove() { removed = true; }};
  } }
  const callx = new Callx(new NativeCallxBackend({module, rn:{NativeModules:{Callx:module}, NativeEventEmitter:Emitter}}));
  const received = []; const off = callx.addCallRequestListener(value => received.push(value));
  await new Promise(resolve => setImmediate(resolve));
  event({handle:'hao.dev7', displayName:'Hao', video:false});
  assert.deepEqual(received, [pending, {handle:'hao.dev7', displayName:'Hao', video:false}]);
  off(); event({handle:'ignored', video:false});
  assert.equal(received.length, 2); assert.equal(removed, true); assert.equal(released, 1);
});
