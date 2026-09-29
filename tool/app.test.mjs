import assert from 'node:assert/strict';
import test from 'node:test';
import { parse } from './app.mjs';

test('app arguments pick an example, a platform and options', () => {
  assert.deepEqual(parse(['flutter', 'android']), { framework: 'flutter', platform: 'android', release: false, buildOnly: false });
  assert.deepEqual(parse(['rn', 'ios', '--device', 'ABC', '--release', '--build-only']),
    { framework: 'rn', platform: 'ios', release: true, buildOnly: true, device: 'ABC' });
  assert.equal(parse(['flutter', 'android', '--avd', 'Pixel_10_Pro']).avd, 'Pixel_10_Pro');
  assert.throws(() => parse(['kotlin', 'android']), /flutter or rn/);
  assert.throws(() => parse(['rn', 'web']), /android or ios/);
  assert.throws(() => parse(['rn', 'ios', '--device']), /Unknown option/);
});
