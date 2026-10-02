#!/usr/bin/env node
// Local Android emulator demo: RN Steven calls Flutter hao.dev7 through real FCM/LiveKit.
// Run instead of call:console, with both examples and tool/android-ui probe installed.
// This harness supplies demo signaling; it does not write native call state or simulate media.
import {createServer} from 'node:http';
import {execFile, spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {existsSync, mkdirSync, readdirSync, statSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createConsole, liveKitToken} from '../packages/testkit/src/console.mjs';
import {sendAndroid} from '../packages/testkit/src/push.mjs';
import {controlPoint} from '../packages/testkit/src/conformance.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const options = {caller: 'emulator-5558', callee: 'emulator-5556', output: '/tmp/callx-two-device-demo', capture: 'screenshots'};
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i]?.replace(/^--/, '') as keyof typeof options;
  if (!(key in options) || !process.argv[i + 1]) throw Error('Unknown or incomplete option');
  options[key] = process.argv[i + 1]!;
}
if (![options.caller, options.callee].every(d => /^emulator-\d+$/.test(d)) || options.caller === options.callee)
  throw Error('Choose two different Android emulators.');
if (!['screenshots', 'screenrecord'].includes(options.capture)) throw Error('--capture must be screenshots or screenrecord');
const secretDir = join(root, 'packages/secrets');
const serviceAccount = process.env.CALLX_DEMO_SERVICE_ACCOUNT ?? join(secretDir,
  readdirSync(secretDir).find(f => /(?:adminsdk|service-account).*\.json$/.test(f)) ?? 'missing');
mkdirSync(options.output, {recursive: true});
if (existsSync(join(options.output, 'result.json'))) throw Error('Choose a new output directory for each take.');
const run = promisify(execFile);
const adb = (device: string, ...args: string[]) => run('adb', ['-s', device, ...args],
  {maxBuffer: 1 << 24, timeout: 25000}).then(r => r.stdout);
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const console_ = createConsole({send: (args: object) => sendAndroid({...args, serviceAccount})});
let callId: string | undefined;
let credentialsIssued = 0;
const marks: {name: string; seconds: number}[] = [];
const checks: {name: string; passed: boolean}[] = [];
let recordingStarted = 0;
function mark(name: string) { marks.push({name, seconds: (Date.now() - recordingStarted) / 1000}); console.log(name); }
function check(name: string, passed: boolean) {
  checks.push({name, passed}); console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`);
  if (!passed) throw Error(name);
}
async function wait(predicate: () => Promise<boolean>, seconds = 30) {
  for (let i = 0; i < seconds; i++) { if (await predicate()) return true; await sleep(1000); }
  return false;
}
async function xml(device: string) {
  const s = await adb(device, 'shell', 'am', 'instrument', '-w', '-r', 'dev.callx.trial.ui/dev.callx.trial.ui.Dump');
  return s.match(/INSTRUMENTATION_RESULT: xml=(.*?)(?:\r?\nINSTRUMENTATION_|$)/s)?.[1] ?? '';
}
async function tap(device: string, label: string) {
  await adb(device, 'shell', 'input', 'keyevent', 'KEYCODE_WAKEUP');
  for (let attempt = 0; attempt < 6; attempt++) {
    const p = controlPoint(await xml(device), label);
    if (p) {
      await adb(device, 'shell', 'input', 'tap', String(p.x), String(p.y)); await sleep(900); return;
    }
    const size = (await adb(device, 'shell', 'wm', 'size')).match(/(\d+)x(\d+)/)!;
    const x = Math.round(Number(size[1]) / 2), height = Number(size[2]);
    await adb(device, 'shell', 'input', 'swipe', String(x), String(Math.round(height * .82)),
      String(x), String(Math.round(height * .42)), '350'); await sleep(400);
  }
  throw Error(`Missing control: ${label} on ${device}`);
}
const logs = (d: string) => adb(d, 'logcat', '-d', '-s', 'CallxExample:I');
async function screenshot(device: string, name: string) {
  const r = await run('adb', ['-s', device, 'exec-out', 'screencap', '-p'], {encoding: 'buffer', maxBuffer: 1 << 26});
  writeFileSync(join(options.output, name + '.png'), r.stdout);
}
async function signal(device: string, message: string, name?: string) {
  const d = console_.snapshot().devices.find((d: {app: string}) => d.app === device);
  if (!d?.token) throw Error(`No fresh FCM token for ${device}`);
  const r = await sendAndroid({serviceAccount, token: d.token, callId, message, name, video: true, expiresIn: 90});
  check(`FCM ${message} accepted`, r.status === 200);
}
// Demo-only credential allocation: answerer's media request precedes outgoing acceptance.
// Assert this order before signaling caller; reconnect/failover is outside this recording.
const server = createServer(async (req, res) => {
  try {
    let text = ''; for await (const chunk of req) text += chunk;
    const body = text ? JSON.parse(text) : {};
    let value: unknown;
    if (req.url === '/api/device') { console_.report(body); value = {}; }
    else if (req.url === '/api/media-token') {
      if (body.callId !== callId || credentialsIssued >= 2) throw Error('Unexpected demo media request');
      const identity = credentialsIssued++ === 0 ? 'hao.dev7' : 'Steven';
      value = {url: 'ws://127.0.0.1:7880', token: liveKitToken({key: 'devkey', secret: 'secret',
        room: `call-${callId}`, identity, name: identity})};
    } else if (req.url === '/api/state') value = console_.snapshot();
    else { res.writeHead(404).end(); return; }
    res.writeHead(200, {'content-type': 'application/json'}).end(JSON.stringify(value));
  } catch { res.writeHead(400).end(JSON.stringify({error: 'Demo request rejected'})); }
});
await new Promise<void>((resolve, reject) => {server.once('error', reject); server.listen(8787, '127.0.0.1', resolve);});
const devices = [options.caller, options.callee];
const screenTimeouts = new Map<string, string>();
const recorders: ReturnType<typeof spawn>[] = [];
const captureJobs: Promise<void>[] = [];
let stopCapturing = false;
let captureFailure: string | undefined;
async function captureFrames(device: string, name: string) {
  const frames: {file: string; seconds: number}[] = [];
  mkdirSync(join(options.output, name));
  try {
    while (!stopCapturing) {
      const started = Date.now();
      const r = await run('adb', ['-s', device, 'exec-out', 'screencap', '-p'],
        {encoding: 'buffer', maxBuffer: 1 << 26, timeout: 15000});
      const file = `${name}/${String(frames.length).padStart(6, '0')}.png`;
      writeFileSync(join(options.output, file), r.stdout);
      frames.push({file, seconds: (started - recordingStarted) / 1000});
      await sleep(Math.max(0, 500 - (Date.now() - started)));
    }
  } catch { captureFailure = `Frame capture failed on ${device}`; }
  finally { writeFileSync(join(options.output, name + '.frames.json'), JSON.stringify(frames)); }
}
let failure: string | undefined;
try {
  for (const d of devices) {
    screenTimeouts.set(d, (await adb(d, 'shell', 'settings', 'get', 'system', 'screen_off_timeout')).trim());
    for (const port of [8787, 7880, 7881]) await adb(d, 'reverse', `tcp:${port}`, `tcp:${port}`);
    await adb(d, 'shell', 'input', 'keyevent', 'KEYCODE_WAKEUP');
    await adb(d, 'shell', 'wm', 'dismiss-keyguard');
    await adb(d, 'shell', 'settings', 'put', 'system', 'screen_off_timeout', '600000');
    await adb(d, 'shell', 'am', 'force-stop', 'dev.bearblock.callx');
    const activity = (await adb(d, 'shell', 'cmd', 'package', 'resolve-activity', '--brief', 'dev.bearblock.callx')).trim().split('\n').at(-1)!;
    await adb(d, 'shell', 'am', 'start', '-W', '-n', activity); await adb(d, 'logcat', '-c');
    await adb(d, 'shell', 'input', 'keyevent', 'KEYCODE_WAKEUP');
  }
  check('both framework hosts report FCM readiness', await wait(async () => {
    const ds = console_.snapshot().devices; return ['flutter', 'react-native'].every(a => ds.some((d: {app: string; token?: string}) => d.app === a && d.token));
  }));
  check('devices have distinct FCM tokens', new Set(console_.snapshot().devices.map((d: {token: string}) => d.token)).size === 2);
  await tap(options.caller, 'Start outgoing video');
  await adb(options.caller, 'shell', 'input', 'keyevent', 'KEYCODE_BACK');
  await tap(options.caller, 'Diagnostics');
  callId = (await xml(options.caller)).match(/demo-\d+-\d+/)?.[0];
  if (!callId) throw Error('Outgoing call ID missing from native snapshot');
  await tap(options.caller, 'Calls'); await tap(options.caller, 'Return to call');
  recordingStarted = Date.now();
  for (const [i, d] of devices.entries()) {
    if (options.capture === 'screenshots') captureJobs.push(captureFrames(d, i === 0 ? 'steven-rn' : 'hao-flutter'));
    else recorders.push(spawn('adb', ['-s', d, 'shell', 'screenrecord',
      '--bit-rate', '3000000', '--time-limit', '180', `/sdcard/callx-demo-${i}.mp4`], {stdio: 'ignore'}));
  }
  await sleep(1200);
  await adb(options.callee, 'shell', 'input', 'keyevent', 'KEYCODE_HOME');
  mark('Steven calls hao.dev7'); await signal('flutter', 'invite', 'Steven');
  check('native incoming rings as Steven', await wait(async () => /ringing .*\(Steven\)/.test(await logs(options.callee))));
  await adb(options.callee, 'shell', 'input', 'keyevent', 'KEYCODE_WAKEUP'); await sleep(1800);
  mark('Accept from native incoming screen'); await tap(options.callee, 'Answer');
  check('callee requested media before caller acceptance', await wait(async () => credentialsIssued === 1));
  await signal('react-native', 'accept');
  check('caller received acceptance and requested media', await wait(async () => credentialsIssued === 2));
  check('audio connects to Steven', await wait(async () => /media connected.*hearing Steven/.test(await logs(options.callee))));
  check('audio connects to hao.dev7', await wait(async () => /media connected.*hearing hao.dev7/.test(await logs(options.caller))));
  mark('Enable video on both devices'); await tap(options.caller, 'Camera on'); await tap(options.callee, 'Camera on');
  for (const d of devices) check(`remote native video arrives on ${d}`, await wait(async () => /remote video for/.test(await logs(d))));
  await sleep(3500);
  mark('Mute and unmute'); await tap(options.caller, 'Mute'); await sleep(1800); await tap(options.caller, 'Unmute');
  mark('Hold and resume'); await tap(options.caller, 'Hold'); await sleep(1800); await tap(options.caller, 'Resume');
  mark('Switch local camera'); await tap(options.callee, 'Switch camera'); await sleep(2200);
  mark('Minimize inside app'); await adb(options.callee, 'shell', 'input', 'keyevent', 'KEYCODE_BACK');
  check('mini-call keeps Home', (await xml(options.callee)).includes('Return to call'));
  await sleep(2200); await tap(options.callee, 'Return to call');
  mark('Android system PiP'); await tap(options.caller, 'Picture in picture');
  check('system PiP is pinned', await wait(async () => /mWindowingMode=pinned/.test(await adb(options.caller, 'shell', 'dumpsys', 'window', 'windows'))));
  await sleep(4000);
  await screenshot(options.caller, 'system-pip');
  const activity = (await adb(options.caller, 'shell', 'cmd', 'package', 'resolve-activity', '--brief', 'dev.bearblock.callx')).trim().split('\n').at(-1)!;
  await adb(options.caller, 'shell', 'am', 'start', '-W', '-n', activity); await sleep(1500);
  mark('Camera off and branded fallback'); await tap(options.caller, 'Camera off'); await tap(options.callee, 'Camera off');
  await sleep(1800); await tap(options.caller, 'Picture in picture'); await sleep(3000);
  check('fallback system PiP is pinned', /mWindowingMode=pinned/.test(await adb(options.caller, 'shell', 'dumpsys', 'window', 'windows')));
  await screenshot(options.caller, 'fallback-pip');
  await adb(options.caller, 'shell', 'am', 'start', '-W', '-n', activity); await sleep(1200);
  mark('hao.dev7 ends the call'); await tap(options.callee, 'End call'); await signal('react-native', 'end');
  check('remote end removes caller overlay', await wait(async () => !(await xml(options.caller)).includes('Minimize call')));
  await sleep(2000); mark('Complete');
} catch (e) { failure = String(e instanceof Error ? e.message : e); console.error(failure); }
finally {
  stopCapturing = true;
  await Promise.all(captureJobs);
  failure ??= captureFailure;
  for (const [i, d] of devices.entries()) {
    if (recorders[i]) {
      await adb(d, 'shell', 'pkill', '-2', 'screenrecord').catch(() => {}); await sleep(700);
      await adb(d, 'pull', `/sdcard/callx-demo-${i}.mp4`, join(options.output, i === 0 ? 'steven-rn.mp4' : 'hao-flutter.mp4')).catch(() => {});
      await adb(d, 'shell', 'rm', `/sdcard/callx-demo-${i}.mp4`).catch(() => {});
    }
  }
  if (failure && callId) for (const app of ['flutter', 'react-native']) await signal(app, 'end').catch(() => {});
  for (const [d, timeout] of screenTimeouts) {
    await adb(d, 'shell', 'settings', timeout === 'null' ? 'delete' : 'put', 'system',
      'screen_off_timeout', ...(timeout === 'null' ? [] : [timeout])).catch(() => {});
  }
  for (const name of options.capture === 'screenshots' ? ['steven-rn.frames.json', 'hao-flutter.frames.json'] : ['steven-rn.mp4', 'hao-flutter.mp4']) {
    const path = join(options.output, name);
    const passed = existsSync(path) && statSync(path).size > 2;
    checks.push({name: `recording saved: ${name}`, passed});
    if (!passed) failure ??= `Recording missing: ${name}`;
  }
  server.close();
  writeFileSync(join(options.output, 'result.json'), JSON.stringify({status: failure ? 'failed' : 'passed', failure,
    capture: options.capture === 'screenshots' ? 'adb screencap samples, real elapsed timestamps' : 'adb screenrecord',
    caller: {name: 'Steven', framework: 'React Native', device: options.caller},
    callee: {name: 'hao.dev7', framework: 'Flutter', device: options.callee},
    signaling: 'local demo backend, real FCM; example-only accept/end signals', media: 'native LiveKit on both devices', checks, marks}, null, 2));
}
if (failure) process.exitCode = 1;
