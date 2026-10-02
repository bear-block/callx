#!/usr/bin/env node
// Runs the media adapter conformance on several Android emulators, one after another, and prints
// one row per emulator. Each emulator boots without a window, gets the example installed with its
// permissions granted, registers with the call console, runs callx-conformance and shuts down.
//
//   npm run conformance:matrix -- [--apk <path>] [--console <url>] [--settle <seconds>] [--video] [--headless] <avd> [<avd> ...]
//
// --video runs the video conformance (ADR-0010); emulators always boot with emulated cameras.
// Emulators boot one at a time with their window, so the run can be watched; --headless hides it.
//
// Needs the call console (npm run call:console) and the media server (npm run media:server).
// Without --apk it builds the Flutter example (debug), which reports to the console. Each
// emulator's logcat is kept in build/emulator-matrix/<avd>.logcat. The example is uninstalled and
// installed again on every emulator.
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT ?? join(homedir(), 'Library/Android/sdk');
const emulatorBinary = join(sdk, 'emulator/emulator');
const PACKAGE = 'dev.bearblock.callx';
const logs = join(root, 'build/emulator-matrix');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function parseArguments(argv) {
  const options = { avds: [], console: 'http://127.0.0.1:8787', apk: null, settle: 60, video: false, headless: false };
  for (let index = 0; index < argv.length; index++) {
    const value = argv[index];
    if (value === '--apk' || value === '--console') options[value.slice(2)] = argv[++index];
    else if (value === '--settle') options.settle = Number(argv[++index]);
    else if (value === '--video') options.video = true;
    else if (value === '--headless') options.headless = true;
    else if (value.startsWith('--')) throw new Error(`Unknown option ${value}.`);
    else options.avds.push(value);
  }
  if (options.avds.length === 0) throw new Error('Name at least one AVD (emulator -list-avds).');
  return options;
}

/** "N/M passed" from the conformance output, or null when it did not finish. */
export function conformanceSummary(output) {
  const match = output.match(/(\d+)\/(\d+) passed/);
  return match ? { passed: Number(match[1]), total: Number(match[2]) } : null;
}

const adb = (args, serial) => spawnSync('adb', [...(serial ? ['-s', serial] : []), ...args], { encoding: 'utf8', maxBuffer: 1 << 28 });
const emulators = () => adb(['devices']).stdout.split('\n').map((line) => line.split('\t')[0]).filter((id) => id.startsWith('emulator-'));

function buildApk() {
  const dir = join(root, 'packages/callx/example');
  const flutter = spawnSync('which', ['fvm']).status === 0 ? ['fvm', 'flutter'] : ['flutter'];
  console.log('Building the Flutter example (debug)…');
  execFileSync(flutter[0], [...flutter.slice(1), 'build', 'apk', '--debug'], { cwd: dir, stdio: 'inherit' });
  return join(dir, 'build/app/outputs/flutter-apk/app-debug.apk');
}

async function boot(avd, headless) {
  const before = new Set(emulators());
  const child = spawn(emulatorBinary, ['-avd', avd, ...(headless ? ['-no-window'] : []), '-no-snapshot-save', '-no-boot-anim',
    '-camera-front', 'emulated', '-camera-back', 'emulated'], { stdio: 'ignore', detached: true });
  child.unref();
  for (let second = 0; second < 240; second += 2) {
    const serial = emulators().find((id) => !before.has(id));
    if (serial && adb(['shell', 'getprop', 'sys.boot_completed'], serial).stdout.trim() === '1') return serial;
    await sleep(2000);
  }
  throw new Error(`${avd} did not boot within 4 minutes.`);
}

/** Starts the launcher activity, retrying while the package manager settles after a first boot. */
async function launch(serial) {
  for (let attempt = 0; attempt < 10; attempt++) {
    const activity = adb(['shell', 'cmd', 'package', 'resolve-activity', '--brief', PACKAGE], serial).stdout.trim().split('\n').pop();
    if (activity?.includes('/')) adb(['shell', 'am', 'start', '-W', '-n', activity], serial);
    await sleep(3000);
    if (adb(['shell', 'pidof', PACKAGE], serial).stdout.trim()) return true;
  }
  return false;
}

/**
 * Telecom removes an uninstalled app's PhoneAccount a few seconds later, and if the new install
 * registered by then, that removal deletes the new account too.
 */
async function waitForTelecomCleanup(serial) {
  for (let second = 0; second < 30; second++) {
    if (!adb(['shell', 'dumpsys', 'telecom'], serial).stdout.includes(`${PACKAGE}/`)) return;
    await sleep(1000);
  }
}

async function consoleTokens(consoleUrl) {
  try { return new Set((await (await fetch(`${consoleUrl}/api/state`)).json()).devices?.map((device) => device.token).filter(Boolean)); }
  catch { return new Set(); }
}

/**
 * Waits for an online device with a token the console did not have before this emulator booted.
 * Every emulator reports the same model, so the console keeps the previous emulator's token
 * under the same key until the new install reports its own.
 */
async function waitForRegistration(consoleUrl, seconds, staleTokens) {
  for (let second = 0; second < seconds; second += 2) {
    try {
      const state = await (await fetch(`${consoleUrl}/api/state`)).json();
      if (state.devices?.some((device) => device.online && device.token && !staleTokens.has(device.token))) return true;
    } catch { /* the console may be busy; try again */ }
    await sleep(2000);
  }
  return false;
}

async function runOne(avd, apk, consoleUrl, settle, video, headless) {
  const serial = await boot(avd, headless);
  const api = adb(['shell', 'getprop', 'ro.build.version.sdk'], serial).stdout.trim();
  try {
    adb(['shell', 'wm', 'dismiss-keyguard'], serial);
    adb(['shell', 'settings', 'put', 'system', 'screen_off_timeout', '1800000'], serial);
    // A fresh install gets a fresh FCM token, and replaces a build signed with another key.
    adb(['uninstall', PACKAGE], serial);
    await waitForTelecomCleanup(serial);
    const staleTokens = await consoleTokens(consoleUrl);
    const install = adb(['install', '-g', apk], serial);
    if (install.status !== 0) return { avd, api, result: 'install failed', detail: install.stderr.trim().split('\n').pop() };
    adb(['reverse', 'tcp:8787', 'tcp:8787'], serial);
    if (!(await launch(serial))) return { avd, api, result: 'launch failed', detail: 'the app process never started' };
    // A first boot is slow: Play services set up before FCM hands out a token.
    if (!(await waitForRegistration(consoleUrl, 240, staleTokens))) return { avd, api, result: 'no FCM token', detail: 'the app never registered with the console' };
    // A freshly booted emulator's network and Play services connection to FCM reconnect during the
    // first minute; an invitation sent then arrives too late to ring.
    await sleep(settle * 1000);
    const run = spawnSync('node', [join(root, 'packages/testkit/src/conformance.mjs'), 'android', '--device', serial, '--console', consoleUrl,
      ...(video ? ['--video'] : [])],
      { encoding: 'utf8', timeout: 300_000 });
    const output = `${run.stdout}\n${run.stderr}`;
    process.stdout.write(output.split('\n').map((line) => (line ? `    ${line}` : line)).join('\n'));
    const summary = conformanceSummary(output);
    const failed = output.split('\n').find((line) => line.startsWith('✘'));
    return { avd, api, result: summary ? `${summary.passed}/${summary.total}` : 'did not finish', detail: failed ?? '' };
  } finally {
    mkdirSync(logs, { recursive: true });
    writeFileSync(join(logs, `${avd}.logcat`), adb(['logcat', '-d', '-v', 'time'], serial).stdout ?? '');
    adb(['emu', 'kill'], serial);
    for (let second = 0; second < 30 && emulators().includes(serial); second++) await sleep(1000);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const options = parseArguments(process.argv.slice(2));
  if (!existsSync(emulatorBinary)) throw new Error(`No emulator at ${emulatorBinary}.`);
  if (emulators().length > 0) throw new Error('Shut the running emulators down first; the matrix boots its own.');
  const apk = options.apk ?? buildApk();
  const rows = [];
  for (const avd of options.avds) {
    console.log(`\n▶ ${avd}`);
    try { rows.push(await runOne(avd, apk, options.console, options.settle, options.video, options.headless)); }
    catch (error) { rows.push({ avd, api: '?', result: 'error', detail: error.message }); }
  }
  console.log('\nAVD | API | Result | First failure');
  for (const row of rows) console.log(`${row.avd} | ${row.api} | ${row.result} | ${row.detail}`);
  process.exitCode = rows.every((row) => /^(\d+)\/\1$/.test(row.result)) ? 0 : 1;
}
