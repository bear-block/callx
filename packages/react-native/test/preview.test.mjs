import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Callx} from '../lib/index.js';
import {CALL_STATES, COMMAND_STATUSES, CONTRACT_VERSION, END_REASONS, ERROR_CODES} from '../lib/index.js';
import {createCallxPreview} from '../lib/preview.js';
const scenarios = JSON.parse(readFileSync(new URL('../../../contracts/preview-scenarios.json', import.meta.url), 'utf8'));
for (const scenario of scenarios) test(scenario.name, async () => {
  const {callx, simulator} = createCallxPreview();
  await callx.setup();
  const input = {callId:'call-1',displayName:'hao.dev7',handle:'sip:hao.dev7@example.invalid'};
  const actions = {
    incoming:()=>simulator.incoming(input), startCall:()=>callx.startCall(input),
    answer:()=>callx.answer(input.callId), end:()=>callx.end(input.callId),
    mediaConnected:()=>simulator.mediaConnected(), remoteAnswered:()=>simulator.remoteAnswered(),
    remoteEnded:()=>simulator.remoteEnded(), mute:()=>callx.setMuted(input.callId,true),
    hold:()=>callx.setHeld(input.callId,true), resume:()=>callx.setHeld(input.callId,false),
  };
  let sequence = 0n;
  for (const step of scenario.steps) {
    await actions[step.action]();
    const snapshot = await callx.getSnapshot();
    assert.ok(BigInt(snapshot.sequence) > sequence);
    sequence = BigInt(snapshot.sequence);
    for (const key of ['state','muted','mediaReady','endReason']) {
      if (key in step) assert.equal(snapshot.call[key],step[key]);
    }
  }
  callx.dispose();
});
test('native mode never silently mocks', async () => {
  await assert.rejects(new Callx().setup(), {code:'nativeUnavailable'});
});
test('public vocabulary matches the canonical v0 manifest', () => {
  const manifest = JSON.parse(readFileSync(new URL('../../../contracts/v0/manifest.json', import.meta.url), 'utf8'));
  assert.equal(CONTRACT_VERSION, manifest.contractVersion);
  assert.deepEqual(CALL_STATES, manifest.callStates);
  assert.deepEqual(END_REASONS, manifest.endReasons);
  assert.deepEqual(COMMAND_STATUSES, manifest.commandStatuses);
  assert.deepEqual(ERROR_CODES, manifest.errorCodes);
});
test('caller operationId survives the wrapper and result', async () => {
  const {callx,simulator}=createCallxPreview();
  await callx.setup();
  await simulator.incoming({callId:'a',displayName:'A',handle:'sip:a@example.invalid'});
  const result=await callx.answer('a',{operationId:'retry-safe-answer-1'});
  assert.equal(result.operationId,'retry-safe-answer-1');
  assert.equal(result.contractVersion,CONTRACT_VERSION);
  assert.equal(result.status,'applied');
  assert.ok(Number.isSafeInteger(result.completedAtMs));
});
test('same operation is idempotent and its terminal result is queryable', async () => {
  const {callx,simulator}=createCallxPreview();
  const capabilities=await callx.setup();
  await simulator.incoming({callId:'a',displayName:'A',handle:'sip:a@example.invalid'});
  const options={operationId:'answer-once'};
  const first=await callx.answer('a',options);
  const second=await callx.answer('a',options);
  assert.strictEqual(second,first);
  const lookup=await callx.queryOperation('answer-once',capabilities.accountGeneration);
  assert.equal(lookup.status,'available');
  assert.strictEqual(lookup.result,first);
  assert.equal((await callx.queryOperation('missing',capabilities.accountGeneration)).status,'unavailable');
  assert.equal((await callx.queryOperation('answer-once','old-generation')).status,'generationMismatch');
});
test('reusing operationId with different arguments returns conflict', async () => {
  const {callx,simulator}=createCallxPreview();
  await callx.setup();
  await simulator.incoming({callId:'a',displayName:'A',handle:'sip:a@example.invalid'});
  await callx.answer('a',{operationId:'reused'});
  const result=await callx.end('a',{operationId:'reused'});
  assert.equal(result.status,'rejected');
  assert.equal(result.error.code,'conflict');
});
test('observation session snapshots, replays and acknowledges ordered events', async () => {
  const {callx,simulator}=createCallxPreview();
  await callx.setup();
  const fresh=await callx.openSession();
  assert.equal(fresh.status,'fresh');
  assert.deepEqual(fresh.replay,[]);
  const live=[];
  // Event between open and listener attach must be buffered by the session.
  await simulator.incoming({callId:'a',displayName:'A',handle:'sip:a@example.invalid'});
  const off=callx.observeEvents(fresh.sessionId,event=>live.push(event));
  await callx.answer('a',{operationId:'observed-answer'});
  assert.deepEqual(live.map(event=>event.kind),['callChanged','callChanged','operationCompleted']);
  await callx.acknowledge(fresh.sessionId,live.at(-1).sequence);
  off(); await callx.closeSession(fresh.sessionId);
  const resumed=await callx.openSession('0');
  assert.equal(resumed.status,'resumed');
  assert.deepEqual(resumed.replay.map(event=>event.sequence),['1','2','3']);
  assert.equal(resumed.snapshot.watermark,'3');
  assert.equal(resumed.snapshot.calls[0].state,'connecting');
  const resynced=await callx.openSession('999');
  assert.equal(resynced.status,'resynced');
  assert.deepEqual(resynced.replay,[]);
});
test('empty operationId fails before transport execution', async () => {
  const {callx}=createCallxPreview();
  await callx.setup();
  await assert.rejects(callx.startCall({callId:'a',displayName:'A',handle:'sip:a@example.invalid'},{operationId:' '}),
    {code:'invalidArgument'});
  assert.equal((await callx.getSnapshot()).call,null);
});
test('reentrant observer commands preserve snapshot order for other observers', async () => {
  const {callx,simulator}=createCallxPreview();
  await callx.setup();
  callx.observe(s=>{if(s.call?.state==='incoming') void callx.answer(s.call.callId);});
  const seen=[];
  const off=callx.observe(s=>seen.push(s.sequence));
  await simulator.incoming({callId:'a',displayName:'A',handle:'sip:a@example.invalid'});
  assert.deepEqual(seen,['0','1','2']);
  off(); callx.dispose();
});
test('setup, busy, stale ID, immutable state, disposal', async () => {
  const {callx, simulator} = createCallxPreview();
  await assert.rejects(simulator.incoming({callId:'a',displayName:'A',handle:'sip:a@example.invalid'}), {code:'notConfigured'});
  await callx.setup();
  await simulator.incoming({callId:'a',displayName:'A',handle:'sip:a@example.invalid'});
  await assert.rejects(simulator.incoming({callId:'b',displayName:'B',handle:'sip:b@example.invalid'}), {code:'busy'});
  await assert.rejects(callx.answer('wrong'), {code:'callNotFound'});
  const snapshot = await callx.getSnapshot();
  assert.throws(()=>{snapshot.call.state='ended';}, TypeError);
  callx.dispose();
  await assert.rejects(callx.answer('a'), {code:'disposed'});
});
test('unsubscribe preserves call, observer exceptions do not fail applied command', async () => {
  const {callx,simulator} = createCallxPreview();
  await callx.setup();
  const seen=[];
  const off=callx.observe(s=>seen.push(s.sequence));
  callx.observe(s=>{if(s.call) throw new Error('UI failure');});
  await simulator.incoming({callId:'a',displayName:'A',handle:'sip:a@example.invalid'});
  off();
  await callx.answer('a');
  assert.deepEqual(seen,['0','1']);
  assert.equal((await callx.getSnapshot()).call.state,'connecting');
});
