import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import test from 'node:test';
import {Callx} from '../lib/index.js';

const MODULE = `{async setup() {return {nativeCalling:true, execution:'native'};}}`;
// Each case needs its own process: Node caches the bindings module after the first load.
const source = `export const TurboModuleRegistry = {get: () => null};
  export const NativeModules = {Callx: ${MODULE}}; export class NativeEventEmitter {}`;

test('lazy native loading finds Callx through the legacy registry when no TurboModule is found', async () => {
  const hook = registerHooks({resolve(specifier, context, next) {
    if (specifier === 'react-native') return {url: 'data:text/javascript,' + encodeURIComponent(source), shortCircuit:true};
    return next(specifier, context);
  }});
  try {
    const capabilities = await new Callx().setup();
    assert.equal(capabilities.nativeCalling, true);
    assert.equal(capabilities.execution, 'native');
  } finally { hook.deregister(); }
});
