import assert from 'node:assert/strict';
import test from 'node:test';
import { answerPoint, crashesIn, parseArguments } from '../src/conformance.mjs';

test('the answer control is found in a uiautomator dump', () => {
  const xml = '<node text="Decline" bounds="[0,0][10,10]"/><node content-desc="Answer" clickable="true" bounds="[360,570][664,666]"/>';
  assert.deepEqual(answerPoint(xml), { x: 512, y: 618 });
  assert.equal(answerPoint('<node text="Decline" bounds="[0,0][1,1]"/>'), null);
});

test('crashes of the app process are found in logcat', () => {
  const log = [
    'I CallxExample: media connected',
    'F libc    : Fatal signal 11 (SIGSEGV), code 2, fault addr 0x0 in tid 1 (AudioRecordJava), pid 7 (bearblock.callx)',
    'E AndroidRuntime: Process: dev.bearblock.callx, PID: 7',
  ].join('\n');
  assert.equal(crashesIn(log, 'dev.bearblock.callx').length, 2);
  assert.equal(crashesIn('I CallxExample: ringing', 'dev.bearblock.callx').length, 0);
});

test('arguments select the device, console and package', () => {
  assert.deepEqual(parseArguments(['android', '--device', 'emulator-5554']),
    { platform: 'android', console: 'http://127.0.0.1:8787', packageName: 'dev.bearblock.callx', device: 'emulator-5554' });
  assert.throws(() => parseArguments(['ios']), /iPhone/);
  assert.throws(() => parseArguments(['android', '--speed']), /Unknown option/);
});
