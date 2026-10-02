#!/usr/bin/env node
// Flutter or RN example PiP trial on an emulator. Restarts the example; requires local console/media and camera permission.
// node tool/pip-smoke.mjs --device emulator-5556 --output /tmp/callx-pip-api36
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {openCaller} from '../packages/testkit/src/caller.mjs';
import {controlPoint, crashesIn} from '../packages/testkit/src/conformance.mjs';
import {decodePng} from '../packages/testkit/src/screen.mjs';
const run = promisify(execFile);
const options = {device: '', output: '/tmp/callx-pip', console: 'http://127.0.0.1:8787', probe: '/tmp/callx-ui-probe/probe.apk', dismiss: 'false', fallback: 'false'};
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i]?.replace(/^--/, '');
  if (!(key in options) || !process.argv[i + 1]) throw new Error(`Unknown option ${process.argv[i]}`);
  options[key] = process.argv[i + 1];
}
if (!options.device) throw new Error('--device is required');
mkdirSync(options.output, {recursive: true});
const adb = (...args) => run('adb', ['-s', options.device, ...args], {maxBuffer: 1 << 26, timeout: 20000}).then(r => r.stdout);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const packageName = 'dev.bearblock.callx';
const activity = (await adb('shell', 'cmd', 'package', 'resolve-activity', '--brief', packageName)).trim().split('\n').pop();
const sdk = Number((await adb('shell', 'getprop', 'ro.build.version.sdk')).trim());
const dimensions = (await adb('shell', 'wm', 'size')).match(/(\d+)x(\d+)/);
const [width, height] = dimensions.slice(1).map(Number);
const steps = [];
let caller, callId, failure, ended = false;
const check = (name, passed, detail = '') => {
  steps.push({name, passed, detail});
  console.log(`${passed ? 'PASS' : 'FAIL'} ${name}${detail ? ': ' + detail : ''}`);
  if (!passed) throw new Error(name);
};
async function waitFor(predicate, seconds = 15) {
  for (let i = 0; i < seconds; i++) { if (await predicate()) return true; await sleep(1000); }
  return false;
}
const appLog = () => adb('logcat', '-d', '-s', 'CallxExample:I');
async function pinnedWindow() {
  return (await adb('shell', 'dumpsys', 'window', 'windows')).split(/\n  Window #/)
    .find(block => block.includes(`package=${packageName} `) &&
      /mFullConfiguration=.*mWindowingMode=pinned/.test(block));
}
const pinned = async () => !!await pinnedWindow();
async function pinnedBounds() {
  const window = await pinnedWindow();
  writeFileSync(join(options.output, 'pinned-window.txt'), window ?? '');
  const bounds = window?.match(/mBounds=Rect\((\d+), (\d+) - (\d+), (\d+)\)/)?.slice(1).map(Number);
  if (!bounds) throw new Error('PiP window bounds missing');
  return bounds;
}
async function brandedPixels() {
  const [left, top, right, bottom] = await pinnedBounds();
  const {width, height, channels, pixels} = decodePng(readFileSync(join(options.output, 'branded-pip.png')));
  const colors = {background: [16, 43, 36], tile: [23, 92, 70], wave: [167, 243, 208]};
  const counts = {background: 0, tile: 0, wave: 0};
  let total = 0;
  for (let y = Math.max(0, top); y < Math.min(height, bottom); y++) {
    for (let x = Math.max(0, left); x < Math.min(width, right); x++) {
      const offset = (y * width + x) * channels;
      for (const [name, rgb] of Object.entries(colors)) {
        if (rgb.every((color, index) => Math.abs(pixels[offset + index] - color) < 16)) counts[name]++;
      }
      total++;
    }
  }
  return Object.fromEntries(Object.entries(counts).map(([name, count]) => [name, count / Math.max(1, total)]));
}
async function videoMotion() {
  const bounds = await pinnedBounds();
  const first = decodePng(readFileSync(join(options.output, 'manual-pip.png')));
  const second = decodePng(readFileSync(join(options.output, 'manual-pip-next-frame.png')));
  if (first.width !== second.width || first.height !== second.height) throw new Error('Screenshot size changed');
  // Restrict motion to the middle of the video window; exclude launcher/system PiP controls.
  const marginX = Math.round((bounds[2] - bounds[0]) * .15);
  const marginY = Math.round((bounds[3] - bounds[1]) * .15);
  let total = 0, changed = 0;
  for (let y = Math.max(0, bounds[1] + marginY); y < Math.min(first.height, bounds[3] - marginY); y++) {
    for (let x = Math.max(0, bounds[0] + marginX); x < Math.min(first.width, bounds[2] - marginX); x++) {
      const p = (y * first.width + x) * first.channels;
      const q = (y * second.width + x) * second.channels;
      if ([0, 1, 2].reduce((sum, i) => sum + Math.abs(first.pixels[p + i] - second.pixels[q + i]), 0) > 24) changed++;
      total++;
    }
  }
  return changed / Math.max(1, total);
}
async function xml() {
  const output = await adb('shell', 'am', 'instrument', '-w', '-r', 'dev.callx.trial.ui/dev.callx.trial.ui.Dump');
  const value = output.match(/INSTRUMENTATION_RESULT: xml=(.*?)(?:\r?\nINSTRUMENTATION_|$)/s)?.[1]?.trim();
  if (!value?.includes('<hierarchy>') || !value.includes('<node')) throw new Error('UI probe returned no visible windows');
  writeFileSync(join(options.output, 'last-ui.xml'), value);
  return value;
}
async function swipe(up) {
  await adb('shell', 'input', 'swipe', String(Math.round(width / 2)), String(Math.round(height * (up ? .85 : .3))),
    String(Math.round(width / 2)), String(Math.round(height * (up ? .6 : .85))), '400');
  await sleep(250);
}
async function tap(label) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const point = controlPoint(await xml(), label);
    if (point) {
      await adb('shell', 'input', 'tap', String(point.x), String(point.y));
      await sleep(800); return;
    }
    // Call controls fit the screen. Scroll only when navigating the diagnostics page.
    await swipe(attempt >= 2);
  }
  throw new Error(`Control missing: ${label}`);
}
async function front() {
  await adb('shell', 'am', 'start', '-W', '-n', activity);
  check('returns to fullscreen', await waitFor(async () => !await pinned(), 10));
  await sleep(1200);
}
async function screenshot(name) {
  const result = await run('adb', ['-s', options.device, 'exec-out', 'screencap', '-p'], {encoding: 'buffer', maxBuffer: 1 << 26});
  writeFileSync(join(options.output, name + '.png'), result.stdout);
}
try {
  if (!existsSync(options.probe)) {
    if (options.probe !== '/tmp/callx-ui-probe/probe.apk') throw new Error('Build the UI probe first: sh tool/android-ui/build.sh');
    await run('sh', [fileURLToPath(new URL('./android-ui/build.sh', import.meta.url))]);
  }
  await adb('install', '-r', options.probe);
  await adb('reverse', 'tcp:8787', 'tcp:8787'); await adb('reverse', 'tcp:7880', 'tcp:7880');
  await adb('shell', 'am', 'force-stop', packageName);
  await front(); await adb('logcat', '-c');
  await tap('Incoming video');
  check('local video invitation rings', await waitFor(async () => /ringing /.test(await appLog())));
  callId = [...(await appLog()).matchAll(/ringing (\S+) \(/g)].at(-1)?.[1];
  if (!callId) throw new Error('Could not identify the test call');
  caller = await openCaller(options.console + '/');
  await caller.evaluate(`joinAudio(${JSON.stringify(callId)}, {video: true})`);
  await adb('shell', 'cmd', 'statusbar', 'expand-notifications');
  await sleep(1200);
  const answer = controlPoint(await xml(), 'Answer');
  if (!answer) throw new Error('Notification answer control missing');
  await adb('shell', 'input', 'tap', String(answer.x), String(answer.y));
  await adb('shell', 'cmd', 'statusbar', 'collapse');
  await front();
  check('audio connects', await waitFor(async () => /media connected \(LiveKit\)/.test(await appLog()), 25));
  check('remote video arrives', await waitFor(async () => /remote video for /.test(await appLog()), 20));
  await tap('Camera on');
  check('local camera starts', await waitFor(async () => /camera on \(front\)/.test(await appLog()), 20));
  check('caller receives local video', await waitFor(async () => await caller.evaluate(`callers[${JSON.stringify(callId)}]?.seesVideo === true`), 20));
  await screenshot('fullscreen-video');
  await tap('Picture in picture');
  check('manual entry pins the activity', await waitFor(pinned));
  await sleep(2000);
  await screenshot('manual-pip');
  await sleep(1200); await screenshot('manual-pip-next-frame');
  const motion = await videoMotion();
  check('PiP video frames change', motion > 0.0005, `changed fraction ${motion.toFixed(5)}`);
  const compact = await xml();
  check('PiP hides app controls', !compact.includes('End call') && !compact.includes('Diagnostics') &&
    !compact.includes('Test controls') && !compact.includes('Incoming video'));
  check('camera continues in PiP', !(await appLog()).includes('camera paused'));
  if (options.dismiss === 'true') {
    const bounds = await pinnedBounds();
    await adb('shell', 'input', 'tap', String(Math.round((bounds[0] + bounds[2]) / 2)),
      String(Math.round((bounds[1] + bounds[3]) / 2)));
    await sleep(600);
    const menu = await xml();
    const close = controlPoint(menu, 'Close') ?? controlPoint(menu, 'Dismiss') ?? controlPoint(menu, 'Close window');
    if (!close) throw new Error('System PiP close control missing');
    await adb('shell', 'input', 'tap', String(close.x), String(close.y));
    check('system close dismisses PiP', await waitFor(async () => !await pinned()));
    check('camera pauses after PiP closes', await waitFor(async () => (await appLog()).includes('camera paused'), 20));
    await front();
    check('camera resumes when the app returns', await waitFor(async () => (await appLog()).includes('camera resumed'), 20));
  }
  await front();
  if (options.fallback === 'true') {
    await caller.evaluate(`callers[${JSON.stringify(callId)}].room.localParticipant.setCameraEnabled(false)`);
    check('remote camera can stop', await waitFor(async () => new RegExp(`remote video for ${callId} (stopped|paused)`).test(await appLog())));
    await tap('Picture in picture');
    check('local-only video enters PiP', await waitFor(pinned));
    await sleep(2000); await screenshot('local-only-pip'); await front();
    await tap('Camera off');
    await tap('Picture in picture');
    check('no-video call enters PiP', await waitFor(pinned));
    await sleep(2000); await screenshot('branded-pip');
    // Android 10 can omit the PiP app from accessibility windows. Verify the actual
    // branded pixels inside the native window, rather than treating missing semantics as UI failure.
    const brand = await brandedPixels();
    check('no-video PiP shows the app background and logo',
      brand.background > .1 && brand.tile > .02 && brand.wave > .001, JSON.stringify(brand));
    await front();
    await caller.evaluate(`callers[${JSON.stringify(callId)}].room.localParticipant.setCameraEnabled(true)`);
    await tap('Camera on');
  }
  await tap('Test controls');
  await tap('Auto PiP off');
  await tap('Return to call');
  await adb('shell', 'input', 'keyevent', 'KEYCODE_HOME'); await sleep(2000);
  if (sdk >= 31) {
    check('automatic entry pins the activity', await waitFor(pinned));
    await sleep(2000);
    await screenshot('automatic-pip');
  } else {
    check('auto-entry stays disabled below Android 12', !await pinned());
  }
  await front(); await tap('End call');
  check('call ends in the app', await waitFor(async () => (await xml()).includes('Call ended'), 10));
  ended = true;
  await adb('shell', 'input', 'keyevent', 'KEYCODE_HOME'); await sleep(2000);
  check('ended call does not auto-enter PiP', !await pinned());
  check('no native crash', crashesIn(await adb('logcat', '-d'), packageName).length === 0);
} catch (error) {
  failure = error.message;
  await screenshot('failure').catch(() => {});
  console.error(error.message); process.exitCode = 1;
} finally {
  if (callId && !ended) { await front().then(() => tap('End call')).catch(() => {}); }
  await caller?.close();
  writeFileSync(join(options.output, 'logcat.txt'), await adb('logcat', '-d'));
  writeFileSync(join(options.output, 'result.json'), JSON.stringify({
    status: failure ? 'failed' : 'passed', error: failure, sdk, device: options.device,
    activity, callId, options: {dismiss: options.dismiss === 'true', fallback: options.fallback === 'true'}, steps,
  }, null, 2) + '\n');
}
