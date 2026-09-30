#!/usr/bin/env node
// Media adapter conformance on an Android device or emulator (ADR-0009): invitation through FCM,
// answer from the notification, media connected, interruption, recovery, remote end, no crash.
//
//   callx-conformance android [--device <adb serial>] [--console http://127.0.0.1:8787]
//
// Needs: the call console (callx-console) and a media server (npm run media:server in this
// repository), the example or your app installed with the microphone allowed, reporting to the
// console, and Chrome for the caller. Exit code 0 when every step passes.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { openCaller } from './caller.mjs';
import { isMain } from './main.mjs';

const run = promisify(execFile);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** The centre of the first "Answer" control in a uiautomator dump, or null. */
export function answerPoint(xml) {
  const match = xml.match(/(?:text|content-desc)="Answer"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
  if (!match) return null;
  const [, left, top, right, bottom] = match.map(Number);
  return { x: Math.round((left + right) / 2), y: Math.round((top + bottom) / 2) };
}

/** Native crashes and uncaught exceptions of the app process in a logcat dump. */
export function crashesIn(log, packageName) {
  return log.split('\n').filter((line) => /Fatal signal \d+|FATAL EXCEPTION/.test(line)
    || (line.includes('AndroidRuntime') && line.includes(`Process: ${packageName}`)));
}

export function parseArguments(argv) {
  const [platform, ...rest] = argv;
  if (platform !== 'android') throw new Error('Only android is supported; iOS conformance needs an iPhone and is manual.');
  const options = { platform, console: 'http://127.0.0.1:8787', packageName: 'dev.bearblock.callx' };
  for (let index = 0; index < rest.length; index += 2) {
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
  const caller = await openCaller(`${options.console}/`);
  const status = () => caller.evaluate('state.calls.find((c) => c.callId === window.__call)?.status');
  const waitFor = async (wanted, seconds) => {
    for (let second = 0; second < seconds; second++) { if (wanted.includes(await status())) return true; await sleep(1000); }
    return false;
  };
  try {
    await adb('logcat', '-c');
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

if (isMain(import.meta.url)) {
  try {
    const steps = await main(parseArguments(process.argv.slice(2)));
    const failed = steps.filter((step) => !step.passed).length;
    console.log(`\n${steps.length - failed}/${steps.length} passed`);
    process.exitCode = failed ? 1 : 0;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
