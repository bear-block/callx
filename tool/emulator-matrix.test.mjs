import assert from 'node:assert/strict';
import {test} from 'node:test';
import {conformanceSummary, parseArguments} from './emulator-matrix.mjs';

test('AVD names and options are parsed', () => {
  assert.deepEqual(parseArguments(['api29', '--apk', 'a.apk', 'api33']),
    {avds: ['api29', 'api33'], console: 'http://127.0.0.1:8787', apk: 'a.apk', settle: 60});
  assert.equal(parseArguments(['--settle', '5', 'api29']).settle, 5);
  assert.throws(() => parseArguments([]), /at least one AVD/);
  assert.throws(() => parseArguments(['--wat']), /Unknown option/);
});

test('the conformance summary is read from its output', () => {
  assert.deepEqual(conformanceSummary('✔ device rings\n\n8/8 passed\n'), {passed: 8, total: 8});
  assert.equal(conformanceSummary('error: no console'), null);
});
