#!/usr/bin/env node
// Demo-only secure-keyguard trial. Never targets a physical device or replaces an existing PIN.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {existsSync, mkdirSync, writeFileSync} from 'node:fs';
import {resolve, join} from 'node:path';
import {openCaller} from '../packages/testkit/src/caller.mjs';
import {controlPoint} from '../packages/testkit/src/conformance.mjs';
const options = {device: 'emulator-5558', output: '/tmp/callx-lockscreen-demo'};
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i]?.replace(/^--/, '') as keyof typeof options;
  if (!(key in options) || !process.argv[i + 1]) throw Error('Use --device <emulator> --output <new directory>');
  options[key] = process.argv[i + 1]!;
}
if (!/^emulator-\d+$/.test(options.device)) throw Error('Demo emulators only');
options.output = resolve(options.output);
if (existsSync(options.output)) throw Error('Choose a new output directory');
mkdirSync(options.output, {recursive: true});
const run = promisify(execFile), pin = '2468';
const adb = (...a: string[]) => run('adb', ['-s', options.device, ...a], {maxBuffer: 1 << 24, timeout: 25000}).then(r => r.stdout);
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const checks: {name: string; passed: boolean}[] = [], marks: {name: string; seconds: number}[] = [];
let started = 0, callId = '', recording = false, pinSet = false, originalDisabled = '', timeout = '';
let failure: string | undefined, caller: Awaited<ReturnType<typeof openCaller>> | undefined;
const stopped = new Set<string>();
const captureJobs = new Map<string, Promise<void>>();
const captureSegments: {name: string; start: number; end?: number}[] = [];
function startFrames(name: string) {
  mkdirSync(join(options.output, name));
  const segment = {name, start: (Date.now() - started) / 1000, end: undefined as number | undefined};
  captureSegments.push(segment);
  captureJobs.set(name, (async () => {
    const frames: {file: string; seconds: number}[] = [];
    try {
      while (!stopped.has(name)) {
        const at = Date.now();
        const image = await run('adb', ['-s', options.device, 'exec-out', 'screencap', '-p'], {encoding:'buffer', maxBuffer:1 << 26, timeout:15000});
        const file = `${name}/${String(frames.length).padStart(6, '0')}.png`;
        writeFileSync(join(options.output, file), image.stdout);
        frames.push({file, seconds:(at - started) / 1000});
        await sleep(Math.max(0, 125 - (Date.now() - at)));
      }
    } catch { failure ??= 'Keyguard frame capture failed'; }
    finally { segment.end = (Date.now() - started) / 1000; writeFileSync(join(options.output, name + '.frames.json'), JSON.stringify(frames)); }
  })());
}
async function stopFrames(name: string) { stopped.add(name); await captureJobs.get(name); }
function mark(name: string) { marks.push({name, seconds: (Date.now() - started) / 1000}); console.log(name); }
function check(name: string, passed: boolean) { checks.push({name, passed}); console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`); if (!passed) throw Error(name); }
async function wait(fn: () => Promise<boolean>, seconds = 30) { for (let i = 0; i < seconds; i++) { if (await fn()) return true; await sleep(1000); } return false; }
async function xml() { const r = await adb('shell', 'am', 'instrument', '-w', '-r', 'dev.callx.trial.ui/dev.callx.trial.ui.Dump'); return r.match(/INSTRUMENTATION_RESULT: xml=(.*?)(?:\r?\nINSTRUMENTATION_|$)/s)?.[1] ?? ''; }
async function tap(label: string) {
  let point = controlPoint(await xml(), label);
  if (!point) {
    const size = (await adb('shell', 'wm', 'size')).match(/(\d+)x(\d+)/)!;
    await adb('shell', 'input', 'tap', String(Math.round(Number(size[1]) / 2)), String(Math.round(Number(size[2]) * .42)));
    await sleep(250); point = controlPoint(await xml(), label);
  }
  if (!point) throw Error(`Missing ${label}`);
  await adb('shell', 'input', 'tap', String(point.x), String(point.y)); await sleep(900);
}
const logs = () => adb('logcat', '-d', '-s', 'CallxExample:I');
async function policy(label: string) { const p = await adb('shell', 'dumpsys', 'window', 'policy'); writeFileSync(join(options.output, label + '.txt'), p); return p; }
async function locked(label: string) {
  const ready = await wait(async () => { const p = await policy(label); return /showing=true/.test(p) && /secure=true/.test(p); }, 8);
  check(label, ready);
}
async function shot(name: string) { const r = await run('adb', ['-s', options.device, 'exec-out', 'screencap', '-p'], {encoding: 'buffer', maxBuffer: 1 << 26}); writeFileSync(join(options.output, name + '.png'), r.stdout); }
async function request(path: string, body: unknown) { const r = await fetch('http://127.0.0.1:8787' + path, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(body)}); if (!r.ok) throw Error(`Console ${path}: HTTP ${r.status}`); return r.json(); }
async function invite(video: boolean) {
  const state = await (await fetch('http://127.0.0.1:8787/api/state')).json();
  const device = state.devices.find((d: {app: string; token?: string}) => d.app === 'react-native' && d.token);
  if (!device) throw Error('RN host has no registered push token');
  await adb('logcat', '-c');
  callId = (await request('/api/invite', {device: device.key, name: 'Steven', expiresIn: 90, video})).callId;
  check(`${video ? 'video' : 'voice'} invitation rings natively`, await wait(async () => (await logs()).includes(`ringing ${callId}`)));
  await adb('shell', 'input', 'keyevent', 'KEYCODE_WAKEUP'); await sleep(700);
  await locked(video ? 'video-incoming-secure' : 'voice-incoming-secure');
  check('native incoming shows Steven', (await xml()).includes('Steven'));
}
async function unlock() {
  await adb('shell', 'input', 'keyevent', 'KEYCODE_WAKEUP');
  if ((await xml()).includes('Open app')) await tap('Open app');
  else await adb('shell', 'wm', 'dismiss-keyguard');
  await sleep(500);
  await adb('shell', 'input', 'text', pin); await adb('shell', 'input', 'keyevent', 'KEYCODE_ENTER'); await sleep(1000);
  check('keyguard dismissed with demo PIN', /showing=false/.test(await policy('unlocked')));
  await adb('shell', 'am', 'start', '-W', '-n', 'dev.bearblock.callx/.MainActivity');
}
async function record(action: 'start' | 'stop') {
  const r = await adb('emu', 'screenrecord', action, ...(action === 'start' ? ['--size', '540x1200', '--fps', '30', '--bit-rate', '4M', '--time-limit', '180', join(options.output, 'lockscreen.webm')] : []));
  if (/\bKO\b/.test(r) || !/\bOK\b/.test(r)) throw Error('Emulator recorder failed');
}
try {
  check('device is Android API 36', (await adb('shell', 'getprop', 'ro.build.version.sdk')).trim() === '36');
  check('emulator boot completed', await wait(async () => (await adb('shell', 'getprop', 'sys.boot_completed')).trim() === '1', 90));
  originalDisabled = (await adb('shell', 'locksettings', 'get-disabled')).trim();
  check('no existing secure credential is replaced', /secure=false/.test(await policy('before')) && ['true', 'false'].includes(originalDisabled));
  timeout = (await adb('shell', 'settings', 'get', 'system', 'screen_off_timeout')).trim();
  await adb('shell', 'settings', 'put', 'system', 'screen_off_timeout', '600000');
  for (const port of [8787, 7880, 7881]) await adb('reverse', `tcp:${port}`, `tcp:${port}`);
  await adb('shell', 'input', 'keyevent', 'KEYCODE_WAKEUP'); await adb('shell', 'wm', 'dismiss-keyguard');
  await adb('shell', 'am', 'start', '-W', '-n', 'dev.bearblock.callx/.MainActivity'); await sleep(2000);
  await tap('Diagnostics'); await tap('Use hao.dev7'); await tap('Calls');
  check('receiver demo identity is hao.dev7', (await xml()).includes('You: hao.dev7'));
  const installed = await adb('shell', 'locksettings', 'set-pin', pin);
  pinSet = /success|set to/i.test(installed);
  check('temporary demo PIN installed', pinSet && /secure=true/.test(await policy('pin-installed')));
  await adb('shell', 'locksettings', 'set-disabled', 'false'); await sleep(1200);
  caller = await openCaller('http://127.0.0.1:8787/');
  await adb('shell', 'input', 'keyevent', 'KEYCODE_HOME');
  started = Date.now(); await record('start'); recording = true;
  startFrames('incoming');
  mark('Secure PIN lock screen'); await adb('shell', 'input', 'keyevent', 'KEYCODE_SLEEP'); await sleep(1000);
  await adb('shell', 'input', 'keyevent', 'KEYCODE_WAKEUP'); await locked('initial-secure-lock'); await shot('secure-lock'); await sleep(1300);
  mark('Incoming voice call from Steven'); await invite(false); await shot('voice-incoming'); await sleep(1800);
  mark('Decline without unlocking'); await tap('Decline');
  check('decline ends the call natively', await wait(async () => (await logs()).includes(`ended from notification: ${callId}`)));
  await locked('secure-after-decline'); await sleep(1000);
  mark('Answer a voice call while locked'); await invite(false); await caller.evaluate(`joinAudio(${JSON.stringify(callId)})`); await tap('Answer');
  check('voice media connects before unlock', await wait(async () => (await logs()).includes('media connected (LiveKit)')));
  await locked('secure-during-voice');
  check('native voice screen stays visible after answer', (await xml()).includes('Voice call connected') && (await xml()).includes('Open app'));
  const timer = async () => (await xml()).match(/text="(\d{2}:\d{2})"/)?.[1];
  const voiceTime = await timer(); await sleep(2200);
  check('locked voice timer advances', !!voiceTime && (await timer()) !== voiceTime);
  await shot('locked-voice');
  mark('Mute and unmute without unlocking'); await tap('Mute');
  check('locked mute applied', (await xml()).includes('Unmute')); await sleep(1200); await tap('Unmute');
  check('locked unmute applied', !(await xml()).includes('Unmute'));
  mark('Hold and resume without unlocking'); await tap('Hold');
  check('locked hold applied', (await xml()).includes('On hold') && (await xml()).includes('Resume')); await sleep(1400); await shot('locked-hold'); await tap('Resume');
  check('locked resume applied', (await xml()).includes('Voice call connected'));
  mark('Choose speaker through Telecom'); await tap('Audio route'); await shot('locked-audio-routes');
  if ((await xml()).includes('text="Earpiece"')) {
    await tap('Earpiece');
    check('earpiece selected on native screen', await wait(async () => (await xml()).includes('text="Earpiece"') && !(await xml()).includes('text="Audio"'), 8));
    await sleep(1200); await tap('Audio route');
  } else check('emulator exposes speaker-only audio routes', (await xml()).includes('text="Speaker"'));
  await tap('Speaker');
  check('speaker selected on native screen', await wait(async () => (await xml()).includes('text="Speaker"') && !(await xml()).includes('text="Audio"'), 8));
  await locked('secure-after-controls'); await sleep(1500);
  mark('Remote caller ends the voice call'); await request('/api/signal', {callId, message: 'end'});
  await caller.evaluate(`leaveAudio(${JSON.stringify(callId)})`); await sleep(1800);
  mark('Incoming video call while locked'); await invite(true); await caller.evaluate(`joinAudio(${JSON.stringify(callId)}, {video:true})`); await shot('video-incoming'); await sleep(1500);
  mark('Answer video: camera stays off while locked'); await tap('Answer');
  check('video call audio connects before unlock', await wait(async () => (await logs()).includes('media connected (LiveKit)')));
  await locked('secure-during-video-answer');
  check('native video screen stays visible after answer', (await xml()).includes('Video call') && (await xml()).includes('Open app'));
  const videoTime = await timer(); await sleep(2200);
  check('locked video timer advances', !!videoTime && (await timer()) !== videoTime);
  await shot('locked-video'); check('camera has not started while locked', !(await logs()).includes('camera on')); await sleep(1800);
  mark('Unlock and explicitly enable camera'); await unlock();
  check('accepted call opens overlay', (await xml()).includes('Minimize call'));
  await tap('Camera on'); await stopFrames('incoming');
  check('remote video arrives', await wait(async () => (await logs()).includes('remote video for')));
  check('local camera starts after unlock', await wait(async () => (await logs()).includes('camera on (front)')));
  check('remote participant receives camera video', await wait(async () => await caller!.evaluate(`callers[${JSON.stringify(callId)}]?.seesVideo === true`) === true)); await shot('accepted-video');
  await sleep(6200);
  check('video controls fade after foreground timeout', !controlPoint(await xml(), 'End call'));
  await shot('accepted-video-controls-hidden');
  const display = (await adb('shell', 'wm', 'size')).match(/(\d+)x(\d+)/)!;
  await adb('shell', 'input', 'tap', String(Math.round(Number(display[1]) / 2)), String(Math.round(Number(display[2]) * .42)));
  await sleep(250);
  const revealed = await xml();
  check('touch restores direct video controls', !!controlPoint(revealed, 'End call') && !!controlPoint(revealed, 'Hold') && !controlPoint(revealed, 'More call options'));
  await shot('accepted-video-controls-restored');
  mark('Lock again: camera pauses'); startFrames('camera-pause'); await adb('shell', 'input', 'keyevent', 'KEYCODE_SLEEP');
  check('locking pauses camera', await wait(async () => (await logs()).includes('camera paused')));
  await adb('shell', 'input', 'keyevent', 'KEYCODE_WAKEUP'); await locked('secure-after-camera-pause'); await sleep(1500);
  mark('Unlock: camera resumes'); await unlock();
  check('camera resumes in foreground', await wait(async () => (await logs()).includes('camera resumed'))); await stopFrames('camera-pause'); await sleep(1800); await shot('resumed-video');
  mark('End call'); await tap('End call'); check('call overlay closes', await wait(async () => { const ui = await xml(); return ui.includes('Ready to call') && !ui.includes('Return to call') && !ui.includes('Minimize call'); }, 10));
  await sleep(1500); mark('Complete');
} catch (e) { failure = e instanceof Error ? e.message : String(e); console.error(failure); }
finally {
  for (const name of captureJobs.keys()) await stopFrames(name);
  if (recording) await record('stop').catch(() => { failure ??= 'Recording finalization failed'; });
  if (callId) await request('/api/signal', {callId, message: 'end'}).catch(() => {});
  if (caller) await caller.close().catch(() => { failure ??= 'Caller cleanup failed'; });
  if (pinSet) {
    try {
      const cleared = await adb('shell', 'locksettings', 'clear', '--old', pin);
      if (!/cleared|success/i.test(cleared)) throw Error('Could not clear demo PIN');
      await adb('shell', 'locksettings', 'set-disabled', originalDisabled);
      await adb('shell', 'input', 'keyevent', 'KEYCODE_WAKEUP'); await adb('shell', 'wm', 'dismiss-keyguard');
      check('original lock setting restored', (await adb('shell', 'locksettings', 'get-disabled')).trim() === originalDisabled && /secure=false/.test(await policy('after')));
    } catch { failure ??= 'Temporary PIN cleanup failed; inspect emulator locksettings'; }
  }
  if (timeout) await adb('shell', 'settings', timeout === 'null' ? 'delete' : 'put', 'system', 'screen_off_timeout', ...(timeout === 'null' ? [] : [timeout])).catch(() => { failure ??= 'Could not restore screen timeout'; });
  writeFileSync(join(options.output, 'result.json'), JSON.stringify({status: failure ? 'failed' : 'passed', failure, device: options.device, framework: 'React Native', sdk: 36, policy: 'RequireUnlock', capture: 'emulator recorder with timestamped keyguard display captures', captureSegments, checks, marks}, null, 2));
}
if (failure) process.exitCode = 1;
