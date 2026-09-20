import assert from 'node:assert/strict';
import test from 'node:test';
import {Callx} from '../lib/index.js';
import {NativeCallxBackend} from '../lib/native.js';

test('native transport preserves envelopes and filters session events', async () => {
  let captured;
  let eventListener;
  const module = {
    async setup(value) { captured = value; return {contractVersion:'0.1.0', coreVersion:'0.1.0',
      execution:'native', accountGeneration:'generation-1', nativeCalling:true, durableReplay:true,
      providerManagedSignaling:false, hold:true, mute:true}; },
    async execute(value) { captured = value; return {contractVersion:'0.1.0', operationId:value.operationId,
      status:'applied', execution:'native', completedAtMs:1100}; },
    async queryOperation(value) { captured = value; return {contractVersion:'0.1.0', ...value, status:'unavailable'}; },
    async openSession() { return {contractVersion:'0.1.0', sessionId:'session-1',
      accountGeneration:'generation-1', status:'fresh', snapshot:{contractVersion:'0.1.0',watermark:'0',calls:[]}, replay:[]}; },
    async acknowledge(value) { captured = value; }, async closeSession(value) { captured = value; },
    async getSnapshot() { return {sequence:'0', call:null}; }, dispose() {},
  };
  class Emitter { addListener(_name, listener) { eventListener = listener; return {remove(){ eventListener = undefined; }}; } }
  const backend = new NativeCallxBackend({module, rn:{NativeModules:{Callx:module}, NativeEventEmitter:Emitter}});
  const callx = new Callx(backend);
  assert.equal((await callx.setup({appName:'Acme'})).nativeCalling, true);
  assert.deepEqual(captured, {contractVersion:'0.1.0', appName:'Acme'});
  await callx.startCall({callId:'call-1', displayName:'hao.dev7', handle:'sip:hao.dev7@example.invalid'},
    {operationId:'op-1', deadlineAtMs:5000});
  assert.deepEqual(captured, {contractVersion:'0.1.0', operationId:'op-1', deadlineAtMs:5000,
    type:'startCall', input:{callId:'call-1', displayName:'hao.dev7', handle:'sip:hao.dev7@example.invalid'}});
  const received = []; const off = callx.observeEvents('session-1', event => received.push(event));
  await new Promise(resolve => setImmediate(resolve));
  eventListener({sessionId:'other', eventId:'skip'});
  eventListener({sessionId:'session-1', eventId:'event-1', sequence:'1', kind:'callChanged',
    source:'platform', observedAtMs:1200, contractVersion:'0.1.0'});
  assert.equal(received.length, 1); off(); assert.equal(eventListener, undefined);
});
