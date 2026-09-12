import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Callx} from '../lib/index.js';
import {CALL_STATES, COMMAND_STATUSES, CONTRACT_VERSION, END_REASONS, ERROR_CODES} from '../lib/index.js';
import {createCallxPreview} from '../lib/preview.js';
const scenarios = JSON.parse(readFileSync(new URL('../../../contracts/preview-scenarios.json', import.meta.url), 'utf8'));
for (const scenario of scenarios) test(scenario.name, async () => {
  const {callx, simulator} = createCallxPreview();
  await callx.setup({appName:'Acme'});
  const input = {callId:'call-1',displayName:'hao.dev7'};
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
  await assert.rejects(new Callx().setup({appName:'Acme'}), {code:'nativeNotImplemented'});
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
  await callx.setup({appName:'Acme'});
  await simulator.incoming({callId:'a',displayName:'A'});
  const result=await callx.answer('a',{operationId:'retry-safe-answer-1'});
  assert.equal(result.operationId,'retry-safe-answer-1');
  assert.equal(result.contractVersion,CONTRACT_VERSION);
  assert.equal(result.status,'applied');
  assert.ok(Number.isSafeInteger(result.completedAtMs));
});
test('empty operationId fails before transport execution', async () => {
  const {callx}=createCallxPreview();
  await callx.setup({appName:'Acme'});
  await assert.rejects(callx.startCall({callId:'a',displayName:'A'},{operationId:' '}),
    {code:'invalidArgument'});
  assert.equal((await callx.getSnapshot()).call,null);
});
test('reentrant observer commands preserve snapshot order for other observers', async () => {
  const {callx,simulator}=createCallxPreview();
  await callx.setup({appName:'Acme'});
  callx.observe(s=>{if(s.call?.state==='incoming') void callx.answer(s.call.callId);});
  const seen=[];
  const off=callx.observe(s=>seen.push(s.sequence));
  await simulator.incoming({callId:'a',displayName:'A'});
  assert.deepEqual(seen,['0','1','2']);
  off(); callx.dispose();
});
test('setup, busy, stale ID, immutable state, disposal', async () => {
  const {callx, simulator} = createCallxPreview();
  await assert.rejects(simulator.incoming({callId:'a',displayName:'A'}), {code:'notConfigured'});
  await callx.setup({appName:'Acme'});
  await simulator.incoming({callId:'a',displayName:'A'});
  await assert.rejects(simulator.incoming({callId:'b',displayName:'B'}), {code:'busy'});
  await assert.rejects(callx.answer('wrong'), {code:'callNotFound'});
  const snapshot = await callx.getSnapshot();
  assert.throws(()=>{snapshot.call.state='ended';}, TypeError);
  callx.dispose();
  await assert.rejects(callx.answer('a'), {code:'disposed'});
});
test('unsubscribe preserves call, observer exceptions do not fail applied command', async () => {
  const {callx,simulator} = createCallxPreview();
  await callx.setup({appName:'Acme'});
  const seen=[];
  const off=callx.observe(s=>seen.push(s.sequence));
  callx.observe(s=>{if(s.call) throw new Error('UI failure');});
  await simulator.incoming({callId:'a',displayName:'A'});
  off();
  await callx.answer('a');
  assert.deepEqual(seen,['0','1']);
  assert.equal((await callx.getSnapshot()).call.state,'connecting');
});
