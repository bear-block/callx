import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import test from 'node:test';

const hook = registerHooks({resolve(specifier, context, next) {
  if (specifier === 'react-native') return {
    url: 'data:text/javascript,' + encodeURIComponent(`
      export const TurboModuleRegistry = {get: () => globalThis.pipModule};
      export const NativeModules = {};
      export class NativeEventEmitter {
        addListener(name, listener) {
          globalThis.pipEventName = name;
          globalThis.pipListener = listener;
          return {remove() { globalThis.pipListener = undefined; }};
        }
      }
    `), shortCircuit: true,
  };
  if (specifier.includes('codegenNativeComponent')) return {
    url: 'data:text/javascript,export default () => null;', shortCircuit: true,
  };
  return next(specifier, context);
}});
const {configurePictureInPicture, enterPictureInPicture, addPictureInPictureListener} = await import('../lib/video.js');

test('PiP entry and automatic configuration use the native module', async () => {
  let options;
  globalThis.pipModule = {
    configurePictureInPicture(value) { options = value; },
    async enterPictureInPicture() { return true; },
  };
  configurePictureInPicture({automatic: true});
  assert.deepEqual(options, {automatic: true});
  assert.equal(await enterPictureInPicture(), true);
});

test('PiP reports mode changes and removes its subscription', () => {
  const changes = [];
  const stop = addPictureInPictureListener(value => changes.push(value));
  assert.equal(globalThis.pipEventName, 'callxPictureInPicture');
  globalThis.pipListener(true);
  globalThis.pipListener(false);
  assert.deepEqual(changes, [true, false]);
  stop();
  assert.equal(globalThis.pipListener, undefined);
});

test('an unavailable native module returns false and allows cleanup', async () => {
  globalThis.pipModule = null;
  configurePictureInPicture({automatic: true});
  assert.equal(await enterPictureInPicture(), false);
  addPictureInPictureListener(() => assert.fail('No native events'))();
});

test.after(() => {
  hook.deregister();
  delete globalThis.pipModule;
  delete globalThis.pipEventName;
  delete globalThis.pipListener;
});
