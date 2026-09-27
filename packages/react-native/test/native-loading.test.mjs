import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import test from 'node:test';
import {Callx} from '../lib/index.js';

for (const form of ['named', 'default']) {
  test(`lazy native loading accepts ${form} React Native exports`, async () => {
    const value = `{Callx: {async setup() {return {nativeCalling:true, execution:'native'};}}}`;
    const source = form === 'named' ? `export const NativeModules = ${value};`
      : `export default {NativeModules: ${value}};`;
    const hook = registerHooks({resolve(specifier, context, next) {
      if (specifier === 'react-native') return {url: 'data:text/javascript,' + encodeURIComponent(source), shortCircuit:true};
      return next(specifier, context);
    }});
    try {
      const capabilities = await new Callx().setup({appName:'Loading regression'});
      assert.equal(capabilities.nativeCalling, true);
      assert.equal(capabilities.execution, 'native');
    } finally { hook.deregister(); }
  });
}
