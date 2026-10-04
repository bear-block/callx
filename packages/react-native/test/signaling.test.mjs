import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import test from 'node:test';

registerHooks({resolve(specifier, context, next) {
  if (specifier === 'react-native') return {
    url: 'data:text/javascript,' + encodeURIComponent(`
      export const TurboModuleRegistry = {get: () => globalThis.signalModule};
      export const NativeModules = {};
      export class NativeEventEmitter {}
    `), shortCircuit: true,
  };
  return next(specifier, context);
}});
const {reportRemoteAnswered, reportRemoteEnded} = await import('../lib/index.js');

test('backend events reach the native ingress with their reason', async () => {
  const calls = [];
  globalThis.signalModule = {
    async remoteAnswered(value) { calls.push(['answered', value]); return true; },
    async remoteEnded(value) { calls.push(['ended', value]); return false; },
  };
  assert.equal(await reportRemoteAnswered('call-1'), true);
  assert.equal(await reportRemoteEnded('call-1', 'callerCancelled'), false);
  assert.equal(await reportRemoteEnded('call-2'), false);
  assert.deepEqual(calls, [['answered', {callId: 'call-1'}], ['ended', {callId: 'call-1', reason: 'callerCancelled'}],
    ['ended', {callId: 'call-2', reason: 'remoteEnded'}]]);
});

test('invalid input is rejected before reaching native code', async () => {
  globalThis.signalModule = {async remoteEnded() { throw new Error('must not be called'); }};
  await assert.rejects(reportRemoteEnded('call-1', 'bored'), {code: 'invalidArgument'});
  await assert.rejects(reportRemoteAnswered('bad id'), {code: 'invalidArgument'});
});

test('an older native module without the methods asks for a rebuild', async () => {
  globalThis.signalModule = {};
  await assert.rejects(reportRemoteAnswered('call-1'), {code: 'nativeUnavailable'});
});
