#!/usr/bin/env node
// Media adapter conformance on an Android device or emulator (ADR-0009): invitation through FCM,
// answer from the notification, media connected, interruption, recovery, remote end, no crash.
//
//   callx-conformance android [--device <adb serial>] [--console http://127.0.0.1:8787] [--video]
//
// --video runs the video steps instead (ADR-0010): a video invitation, remote video on the
// device, the camera from the example's buttons, video moving on screen, switching camera, and
// the camera pausing in the background. It needs the example app and an emulator camera.
//
// Needs: the call console (callx-console) and a media server (npm run media:server in this
// repository), the example or your app installed with the microphone allowed, reporting to the
// console, and Chrome for the caller. Exit code 0 when every step passes.
import { execFile } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { openCaller } from './caller.mjs';
import { isMain } from './main.mjs';
import { changedFraction } from './screen.mjs';

const run = promisify(execFile);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** The centre of the first control labelled [label] in a uiautomator dump, or null. */
export function controlPoint(xml, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = xml.match(new RegExp(`(?:text|content-desc)="${escaped}"[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`));
  if (!match) return null;
  const [, left, top, right, bottom] = match.map(Number);
  return { x: Math.round((left + right) / 2), y: Math.round((top + bottom) / 2) };
}

/** The centre of the first "Answer" control in a uiautomator dump, or null. */
export const answerPoint = (xml) => controlPoint(xml, 'Answer');

/** Native crashes and uncaught exceptions of the app process in a logcat dump. */
export function crashesIn(log, packageName) {
  return log.split('\n').filter((line) => /Fatal signal \d+|FATAL EXCEPTION/.test(line)
    || (line.includes('AndroidRuntime') && line.includes(`Process: ${packageName}`)));
}

export function parseArguments(argv) {
  const [platform, ...rest] = argv;
  if (platform !== 'android') throw new Error('Only android is supported; iOS conformance needs an iPhone and is manual.');
  const options = { platform, console: 'http://127.0.0.1:8787', packageName: 'dev.bearblock.callx', video: false };
  for (let index = 0; index < rest.length; index += 2) {
    if (rest[index] === '--video') { options.video = true; index--; continue; }
    const name = rest[index]?.replace(/^--/, '');
    if (!['device', 'console', 'package'].includes(name) || rest[index + 1] === undefined) throw new Error(`Unknown option ${rest[index]}.`);
    options[name === 'package' ? 'packageName' : name] = rest[index + 1];
  }
  return options;
}

async function main(options) {
  const adb = (...args) => run('adb', [...(options.device ? ['-s', options.device] : []), ...args], { maxBuffer: 1 << 26 })
    .then(({ stdout }) => stdout);
  const steps = [];
  const check = (name, passed, detail = '') => { steps.push({ name, passed, detail }); console.log(`${passed ? '✔' : '✘'} ${name}${detail ? ` — ${detail}` : ''}`); };
  /** A step this device cannot show; printed, and counted neither as passed nor failed. */
  const skip = (name, detail) => console.log(`– ${name} — skipped: ${detail}`);
  // A stopped media server makes every media step fail for the wrong reason; say so first.
  const { liveKitUrl } = await (await fetch(`${options.console}/api/state`)).json();
  const mediaUrl = liveKitUrl?.replace(/^ws/, 'http');
  if (mediaUrl && !(await fetch(mediaUrl).then((response) => response.ok, () => false))) {
    throw new Error(`The media server at ${mediaUrl} does not answer; start it with npm run media:server.`);
  }
  const caller = await openCaller(`${options.console}/`);
  const status = () => caller.evaluate('state.calls.find((c) => c.callId === window.__call)?.status');
  const waitFor = async (wanted, seconds) => {
    for (let second = 0; second < seconds; second++) { if (wanted.includes(await status())) return true; await sleep(1000); }
    return false;
  };
  try {
    await adb('logcat', '-c');
    if (options.video) { await videoSteps({ adb, check, skip, caller, waitFor, options }); return steps; }
    const invited = await caller.evaluate(`(async () => { await refresh();
      const device = state.devices.find((d) => d.online && d.token);
      if (!device) return 'no online device with a push token';
      selected = device.key;
      const call = await post('/api/invite', { device: device.key, name: 'conformance', expiresIn: 45 });
      if (!call) return document.getElementById('error').textContent;
      window.__call = call.callId; await joinAudio(call.callId); return 'ok'; })()`);
    check('invitation sent and caller joined', invited === 'ok', invited === 'ok' ? '' : invited);
    if (invited !== 'ok') return steps;
    check('device rings', await waitFor(['ringing'], 30));
    await adb('shell', 'cmd', 'statusbar', 'expand-notifications'); await sleep(1500);
    await adb('shell', 'uiautomator', 'dump', '/sdcard/callx-ui.xml');
    const point = answerPoint(await adb('shell', 'cat', '/sdcard/callx-ui.xml'));
    check('answer control found in the notification', point !== null);
    if (point) await adb('shell', 'input', 'tap', String(point.x), String(point.y));
    check('answer connects media', await waitFor(['active'], 20));
    await caller.evaluate('leaveAudio(window.__call)');
    check('caller leaving is reported as interrupted media', await waitFor(['reconnecting'], 15));
    await caller.evaluate('joinAudio(window.__call)');
    check('caller returning reconnects media', await waitFor(['active'], 20));
    await caller.evaluate(`post('/api/signal', { callId: window.__call, message: 'end', reason: 'remoteEnded' })`);
    check('remote end ends the call', await waitFor(['ended'], 15));
    const crashes = crashesIn(await adb('logcat', '-d'), options.packageName);
    check('no crash', crashes.length === 0, crashes[0] ?? '');
  } finally { await caller.close(); }
  return steps;
}

/**
 * ADR-0010 on Android, driven through the example app: a video invitation rings as a video call,
 * the caller's camera reaches the device, the example's buttons turn the camera on and switch it,
 * video moves on screen, and the camera pauses in the background and resumes in front.
 */
async function videoSteps({ adb, check, skip, caller, waitFor, options }) {
  const appLog = async () => (await adb('logcat', '-d', '-s', 'CallxExample:I')).toString();
  const logged = async (pattern, seconds) => {
    for (let second = 0; second < seconds; second++) { if (pattern.test(await appLog())) return true; await sleep(1000); }
    return false;
  };
  const front = async () => {
    const activity = (await adb('shell', 'cmd', 'package', 'resolve-activity', '--brief', options.packageName)).trim().split('\n').pop();
    await adb('shell', 'am', 'start', '-W', '-n', activity); await sleep(1500);
  };
  /** Taps a control by its label, scrolling the example's page down until it is on screen. */
  const tap = async (label) => {
    for (let attempt = 0; attempt < 4; attempt++) {
      await adb('shell', 'uiautomator', 'dump', '/sdcard/callx-ui.xml');
      const point = controlPoint(await adb('shell', 'cat', '/sdcard/callx-ui.xml'), label);
      if (point) { await adb('shell', 'input', 'tap', String(point.x), String(point.y)); return true; }
      await adb('shell', 'input', 'swipe', '540', '1600', '540', '700', '300'); await sleep(500);
    }
    return false;
  };
  const screenshot = async () => {
    const { stdout } = await run('adb', [...(options.device ? ['-s', options.device] : []), 'exec-out', 'screencap', '-p'],
      { encoding: 'buffer', maxBuffer: 1 << 27 });
    return stdout;
  };

  const invited = await caller.evaluate(`(async () => { await refresh();
    const device = state.devices.find((d) => d.online && d.token);
    if (!device) return 'no online device with a push token';
    selected = device.key;
    const call = await post('/api/invite', { device: device.key, name: 'conformance', expiresIn: 45, video: true });
    if (!call) return document.getElementById('error').textContent;
    window.__call = call.callId; await joinAudio(call.callId, { video: true }); return 'ok'; })()`);
  check('video invitation sent and caller joined with a camera', invited === 'ok', invited === 'ok' ? '' : invited);
  if (invited !== 'ok') return;
  check('device rings', await waitFor(['ringing'], 30));
  // Telecom's own log says how it registered the call; its Call summary (vidst=) does not.
  const sdk = Number((await adb('shell', 'getprop', 'ro.build.version.sdk')).trim());
  if (sdk >= 34) {
    const telecom = (await adb('logcat', '-d', '-s', 'Telecom:I')).toString();
    check('Telecom has it as a video call', /addCall: .*\[callType=2\]/.test(telecom) && /CallAttributes\.VIDEO_CALL/.test(telecom));
  } else {
    skip('Telecom has it as a video call', `API ${sdk}: below 34 Core-Telecom registers calls through ConnectionService as audio`);
  }
  await adb('shell', 'cmd', 'statusbar', 'expand-notifications'); await sleep(1500);
  await adb('shell', 'uiautomator', 'dump', '/sdcard/callx-ui.xml');
  const point = answerPoint(await adb('shell', 'cat', '/sdcard/callx-ui.xml'));
  check('answer control found in the notification', point !== null);
  if (point) await adb('shell', 'input', 'tap', String(point.x), String(point.y));
  check('answer connects audio first', await waitFor(['active'], 20));
  const tracks = () => caller.evaluate(`(() => { const e = callers[window.__call]; if (!e?.room) return 'caller not in room: ' + e?.status + ' ' + (e?.error ?? '');
    const local = [...e.room.localParticipant.trackPublications.values()].map((p) => 'publishes ' + p.kind + (p.isMuted ? ' (muted)' : ''));
    const remote = [...e.room.remoteParticipants.values()].flatMap((r) => [...r.trackPublications.values()]
      .map((p) => 'device ' + p.kind + (p.isSubscribed ? ' subscribed' : ' not subscribed')));
    return [...local, ...remote].join(', '); })()`);
  check('the caller\'s camera reaches the device', await logged(/remote video for /, 20), await tracks());
  await adb('shell', 'cmd', 'statusbar', 'collapse'); await front();
  check('camera button found in the app', await tap('Camera on'));
  check('the camera turns on', await logged(/camera on \(front\)/, 15));
  let sees = false;
  for (let second = 0; second < 15 && !sees; second++) {
    sees = await caller.evaluate('callers[window.__call]?.seesVideo === true'); if (!sees) await sleep(1000);
  }
  check('the caller receives the device camera', sees, sees ? '' : await tracks());
  // Finding the buttons may have scrolled the video panel away; look at a few scroll positions.
  let first, second, moving = 0;
  for (const swipe of [null, ['540', '700', '540', '1600'], ['540', '1600', '540', '700'], ['540', '1600', '540', '700']]) {
    if (swipe) { await adb('shell', 'input', 'swipe', ...swipe, '300'); await sleep(800); }
    first = await screenshot(); await sleep(800); second = await screenshot();
    moving = changedFraction(first, second);
    if (moving > 0.005) break;
  }
  let shots = '';
  if (moving <= 0.005) {
    // Keep the screenshots: they show whether the view was empty, covered or off screen.
    const dir = mkdtempSync(join(tmpdir(), 'callx-video-'));
    writeFileSync(join(dir, 'first.png'), first); writeFileSync(join(dir, 'second.png'), second);
    shots = `; screenshots in ${dir}`;
  }
  check('video moves on screen', moving > 0.005, `${(moving * 100).toFixed(1)}% of the screen changed${shots}`);
  check('switch camera button found', await tap('Switch camera'));
  check('the camera switches to the back', await logged(/camera on \(back\)/, 15));
  await adb('shell', 'input', 'keyevent', 'KEYCODE_HOME');
  check('the camera pauses in the background', await logged(/camera paused/, 10));
  await front();
  check('the camera resumes in front', await logged(/camera resumed/, 10));
  await caller.evaluate(`post('/api/signal', { callId: window.__call, message: 'end', reason: 'remoteEnded' })`);
  check('remote end ends the call', await waitFor(['ended'], 15));
  const crashes = crashesIn(await adb('logcat', '-d'), options.packageName);
  check('no crash', crashes.length === 0, crashes[0] ?? '');
}

if (isMain(import.meta.url)) {
  try {
    const steps = await main(parseArguments(process.argv.slice(2)));
    const failed = steps.filter((step) => !step.passed).length;
    console.log(`\n${steps.length - failed}/${steps.length} passed`);
    process.exitCode = failed ? 1 : 0;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
