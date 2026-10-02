import assert from 'node:assert/strict';
import test from 'node:test';
import { answerPoint, controlPoint, crashesIn, parseArguments } from '../src/conformance.mjs';

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
    { platform: 'android', console: 'http://127.0.0.1:8787', packageName: 'dev.bearblock.callx', video: false,
      device: 'emulator-5554' });
  assert.equal(parseArguments(['android', '--video', '--device', 'emulator-5554']).video, true);
  assert.equal(parseArguments(['android', '--device', 'emulator-5554', '--video']).device, 'emulator-5554');
  assert.throws(() => parseArguments(['ios']), /iPhone/);
  assert.throws(() => parseArguments(['android', '--speed']), /Unknown option/);
});

test('controls are found by text or accessibility label', () => {
  const xml = '<node content-desc="Camera on" bounds="[10,20][110,60]"/><node text="Switch camera" bounds="[0,100][200,140]"/>';
  assert.deepEqual(controlPoint(xml, 'Camera on'), { x: 60, y: 40 });
  assert.deepEqual(controlPoint(xml, 'Switch camera'), { x: 100, y: 120 });
  assert.equal(controlPoint(xml, 'Camera off'), null);
});
