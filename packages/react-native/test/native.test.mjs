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

function sessionHarness() {
  const calls = [];
  const listeners = new Set();
  let sessions = 0;
  let sequence = 0;
  const module = {
    async openSession(value) { calls.push(['openSession', value]); sessions++;
      return {contractVersion:'0.1.0', sessionId:`session-${sessions}`, accountGeneration:'generation-1',
        status:'fresh', snapshot:{contractVersion:'0.1.0', watermark:`${sequence}`, calls:[]}, replay:[]}; },
    // Mirrors the Android module, which resolves these with null.
    async acknowledge(value) { calls.push(['acknowledge', value]); return null; },
    async closeSession(value) { calls.push(['closeSession', value]); return null; },
    async getSnapshot() { return {sequence:`${sequence}`, call:null}; },
    dispose() {},
  };
  class Emitter { addListener(_name, listener) { listeners.add(listener); return {remove() { listeners.delete(listener); }}; } }
  const callx = new Callx(new NativeCallxBackend({module, rn:{NativeModules:{Callx:module}, NativeEventEmitter:Emitter}}));
  const emit = sessionId => { sequence++; for (const listener of listeners) listener({sessionId, eventId:`event-${sequence}`,
    sequence:`${sequence}`, kind:'callChanged', source:'platform', observedAtMs:1000 + sequence, contractVersion:'0.1.0'}); };
  return {callx, calls, emit, sessions: () => sessions};
}
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

test('snapshot observers share the app session and keep updating', async () => {
  const {callx, calls, emit, sessions} = sessionHarness();
  const session = await callx.openSession();
  const first = []; const second = [];
  const offFirst = callx.observe(s => first.push(s.sequence));
  const offSecond = callx.observe(s => second.push(s.sequence));
  await settle();
  emit(session.sessionId);
  await settle();
  assert.equal(sessions(), 1, 'observers must not replace the session');
  assert.deepEqual(first, ['0', '1']);
  assert.deepEqual(second, ['0', '1']);
  await callx.acknowledge(session.sessionId, '1');
  offFirst(); offSecond();
  await settle();
  assert.ok(!calls.some(([method]) => method === 'closeSession'), 'the app owns its session');
});

test('observers open, reopen and release their own session', async () => {
  const {callx, calls, emit, sessions} = sessionHarness();
  const seen = [];
  const off = callx.observe(s => seen.push(s.sequence));
  await settle();
  assert.equal(sessions(), 1);
  const app = await callx.openSession();
  await callx.closeSession(app.sessionId);
  assert.equal(sessions(), 3, 'observers need a live session after close');
  emit('session-3');
  await settle();
  assert.equal(seen.at(-1), '1');
  off();
  await settle();
  assert.deepEqual(calls.at(-1), ['closeSession', {sessionId:'session-3'}]);
});
