#!/usr/bin/env node
// Builds an example app and runs it on a device, emulator or simulator.
//
//   npm run app -- <flutter|rn> <android|ios> [--device <id>] [--release] [--build-only]
//   npm run android:flutter    npm run android:rn    npm run ios:flutter    npm run ios:rn
//
// Android: uses the first connected device, or boots an emulator (--avd <name>, default the first
// AVD). Both examples use the package dev.bearblock.callx with different signing keys, so the
// other example is uninstalled first. iOS: uses a booted simulator, or boots one (--simulator
// <name>, default the first available iPhone); pass --device <udid> for a physical iPhone.
// Flutter runs with hot reload; React Native starts Metro through `expo run`.
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGE = 'dev.bearblock.callx';
const EXAMPLES = {
  flutter: { dir: join(root, 'packages/flutter/example'), activity: 'callx_flutter_example.MainActivity' },
  rn: { dir: join(root, 'packages/react-native/example'), activity: `${PACKAGE}/.MainActivity` },
};

export function parse(argv) {
  const [framework, platform, ...rest] = argv;
  if (!EXAMPLES[framework]) throw new Error('First argument must be flutter or rn.');
  if (!['android', 'ios'].includes(platform)) throw new Error('Second argument must be android or ios.');
  const options = { framework, platform, release: false, buildOnly: false };
  for (let index = 0; index < rest.length; index++) {
    const flag = rest[index];
    if (flag === '--release') options.release = true;
    else if (flag === '--build-only') options.buildOnly = true;
    else if (['--device', '--avd', '--simulator'].includes(flag) && rest[index + 1]) options[flag.slice(2)] = rest[++index];
    else throw new Error(`Unknown option: ${flag}`);
  }
  return options;
}

const log = (message) => console.log(`\x1b[1m▶ ${message}\x1b[0m`);
const capture = (command, args) => {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  return result.status === 0 ? result.stdout : '';
};
function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed (${result.status ?? result.signal}).`);
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const flutter = () => (capture('which', ['fvm']).trim() ? ['fvm', ['flutter']] : ['flutter', []]);

const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT ?? join(homedir(), 'Library/Android/sdk');
const adbDevices = () => capture('adb', ['devices']).split('\n').slice(1)
  .map((line) => line.split('\t')).filter(([, state]) => state === 'device').map(([serial]) => serial);

async function androidDevice(options) {
  if (options.device) return options.device;
  const connected = adbDevices();
  if (connected.length) return connected[0];
  const emulator = join(sdk, 'emulator/emulator');
  if (!existsSync(emulator)) throw new Error('No Android device connected and no emulator found in the Android SDK.');
  const avd = options.avd ?? capture(emulator, ['-list-avds']).split('\n').find(Boolean);
  if (!avd) throw new Error('No Android device connected and no AVD to boot.');
  log(`Booting emulator ${avd}`);
  spawn(emulator, ['-avd', avd], { detached: true, stdio: 'ignore' }).unref();
  for (let second = 0; second < 180; second++) {
    const [serial] = adbDevices();
    if (serial && capture('adb', ['-s', serial, 'shell', 'getprop', 'sys.boot_completed']).trim() === '1') return serial;
    await sleep(1000);
  }
  throw new Error('The emulator did not finish booting within 3 minutes.');
}

function prepareAndroid(serial, framework) {
  // Before the first unlock after a boot, Android does not start apps that are not direct-boot aware.
  if (capture('adb', ['-s', serial, 'shell', 'dumpsys', 'user']).includes('RUNNING_LOCKED')) {
    console.log('  The device has not been unlocked since it booted: unlock it once, or the app will not start.');
  }
  const installed = capture('adb', ['-s', serial, 'shell', 'cmd', 'package', 'resolve-activity', '--brief', PACKAGE]);
  const other = framework === 'flutter' ? EXAMPLES.rn : EXAMPLES.flutter;
  if (installed.includes(other.activity)) {
    log(`Uninstalling the ${framework === 'flutter' ? 'React Native' : 'Flutter'} example (same package, other signing key)`);
    capture('adb', ['-s', serial, 'uninstall', PACKAGE]);
  }
}

function iosTarget(options) {
  if (options.device) return options.device;
  const { devices } = JSON.parse(execFileSync('xcrun', ['simctl', 'list', 'devices', 'available', '--json'], { encoding: 'utf8' }));
  const all = Object.values(devices).flat();
  const booted = all.find((device) => device.state === 'Booted');
  if (booted && !options.simulator) return booted.udid;
  const wanted = all.find((device) => options.simulator ? device.name === options.simulator : device.name.startsWith('iPhone'));
  if (!wanted) throw new Error(`No simulator ${options.simulator ?? 'iPhone'} available.`);
  log(`Booting simulator ${wanted.name}`);
  if (wanted.state !== 'Booted') run('xcrun', ['simctl', 'boot', wanted.udid]);
  spawnSync('open', ['-a', 'Simulator']);
  return wanted.udid;
}

async function main(options) {
  const { dir } = EXAMPLES[options.framework];
  const mode = options.release ? 'release' : 'debug';
  if (options.platform === 'android') {
    if (options.buildOnly) {
      log(`Building the ${options.framework} example for Android (${mode})`);
      if (options.framework === 'flutter') {
        const [command, prefix] = flutter(); return run(command, [...prefix, 'build', 'apk', `--${mode}`], dir);
      }
      run('npx', ['expo', 'prebuild', '--platform', 'android', '--no-install'], dir);
      return run('./gradlew', [options.release ? 'assembleRelease' : 'assembleDebug'], join(dir, 'android'));
    }
    const serial = await androidDevice(options);
    prepareAndroid(serial, options.framework);
    log(`Running the ${options.framework} example on ${serial} (${mode})`);
    if (options.framework === 'flutter') {
      const [command, prefix] = flutter(); return run(command, [...prefix, 'run', '-d', serial, `--${mode}`], dir);
    }
    return run('npx', ['expo', 'run:android', '--device', serial, ...(options.release ? ['--variant', 'release'] : [])], dir);
  }
  if (options.buildOnly) {
    log(`Building the ${options.framework} example for the iOS simulator (${mode})`);
    if (options.framework === 'flutter') {
      const [command, prefix] = flutter();
      return run(command, [...prefix, 'build', 'ios', '--simulator', `--${mode}`], dir);
    }
    run('npx', ['expo', 'prebuild', '--platform', 'ios'], dir);
    return run('xcodebuild', ['-workspace', 'ios/CallxRNPreview.xcworkspace', '-scheme', 'CallxRNPreview',
      '-configuration', options.release ? 'Release' : 'Debug', '-sdk', 'iphonesimulator', '-quiet', 'build'], dir);
  }
  const target = iosTarget(options);
  log(`Running the ${options.framework} example on ${target} (${mode})`);
  if (options.framework === 'flutter') {
    const [command, prefix] = flutter(); return run(command, [...prefix, 'run', '-d', target, `--${mode}`], dir);
  }
  return run('npx', ['expo', 'run:ios', '--device', target, ...(options.release ? ['--configuration', 'Release'] : [])], dir);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try { await main(parse(process.argv.slice(2))); }
  catch (error) { console.error(`\x1b[31m${error.message}\x1b[0m`); process.exitCode = 1; }
}
