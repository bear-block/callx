#!/usr/bin/env node
// Packs every published package without publishing (npm pack --dry-run, pub publish --dry-run)
// and checks each archive: required files present, nothing generated, local or secret.
//
//   npm run release:dry-run
import { execFileSync, spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const FORBIDDEN = [/(^|\/)node_modules\//, /(^|\/)build\//, /(^|\/)\.gradle\//, /(^|\/)\.dart_tool\//, /\.p8$/,
  /google-services\.json$/, /GoogleService-Info\.plist$/, /service-account.*\.json$/, /adminsdk.*\.json$/,
  /(^|\/)pubspec_overrides\.yaml$/, /\.tgz$/, /(^|\/)example\//];

export const NPM_PACKAGES = {
  'packages/react-native': ['lib/index.js', 'lib/index.d.ts', 'app.plugin.cjs', 'plugin/CallxMessagingService.kt.template',
    'callx-react-native.podspec', 'react-native.config.js', 'android/build.gradle', 'ios/CallxModule.swift',
    'ios/CallxModule.mm', 'src/specs/NativeCallx.ts', 'android/src/main/kotlin/dev/callx/reactnative/CallxPackage.kt',
    'ios/CallxCore/CallxBootstrap.swift', 'android/src/main/kotlin/dev/callx/telecom/CallxBootstrap.kt', 'LICENSE', 'README.md'],
  'packages/react-native-livekit': ['lib/index.js', 'lib/index.d.ts', 'app.plugin.cjs', 'callx-livekit.podspec',
    'react-native.config.js', 'android/build.gradle', 'android/src/main/AndroidManifest.xml',
    'android/src/main/kotlin/dev/callx/livekit/LiveKitMediaAdapter.kt', 'ios/CallxLiveKit/LiveKitMediaAdapter.swift',
    'LICENSE', 'README.md'],
  'packages/testkit': ['src/console.mjs', 'src/console-page.mjs', 'src/push.mjs', 'src/conformance.mjs', 'LICENSE', 'README.md'],
};

/** Problems in a packed file list: missing required files and forbidden ones. */
export function problemsIn(files, required) {
  const missing = required.filter((file) => !files.includes(file)).map((file) => `missing ${file}`);
  const forbidden = files.filter((file) => FORBIDDEN.some((pattern) => pattern.test(file))).map((file) => `must not ship ${file}`);
  return [...missing, ...forbidden];
}

function npmPack(dir) {
  const output = execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts=false'], { cwd: join(root, dir), encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'] });
  const [result] = JSON.parse(output.slice(output.indexOf('[')));
  return { files: result.files.map((file) => file.path), size: result.size };
}

/** Paths in pub's tree listing ("│   ├── name (1 KB)"), with a trailing "/" for directories. */
export function pubTreePaths(text) {
  const paths = [];
  const stack = [];
  const lines = text.split('\n');
  for (const [index, line] of lines.entries()) {
    const match = line.match(/^((?:│ {3}| {4})*)[├└]── (.+?)(?: \([^)]*\))?$/u);
    if (!match) continue;
    const depth = match[1].length / 4;
    stack.length = depth;
    stack.push(match[2]);
    const next = lines[index + 1]?.match(/^((?:│ {3}| {4})*)[├└]── /u);
    const isDirectory = Boolean(next) && next[1].length / 4 > depth;
    paths.push(stack.join('/') + (isDirectory ? '/' : ''));
  }
  return paths;
}

/** Compressed archive size in megabytes from pub's "Total compressed archive size" line. */
export function pubArchiveMegabytes(text) {
  const match = text.match(/Total compressed archive size: ([\d.]+) (KB|MB)/);
  if (!match) return 0;
  return match[2] === 'MB' ? Number(match[1]) : Number(match[1]) / 1024;
}

const PUB_MAX_MB = 5;
// pub.dev shows a package's example, so only npm forbids example/.
const PUB_FORBIDDEN = FORBIDDEN.filter((pattern) => !pattern.test('example/'));

function pubDryRun(dir) {
  const flutter = spawnSync('which', ['fvm']).status === 0 ? ['fvm', ['flutter']] : ['flutter', []];
  const result = spawnSync(flutter[0], [...flutter[1], 'pub', 'publish', '--dry-run'], { cwd: join(root, dir), encoding: 'utf8' });
  const text = `${result.stdout}\n${result.stderr}`;
  return { status: result.status, text, files: pubTreePaths(text) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let failed = false;
  for (const [dir, required] of Object.entries(NPM_PACKAGES)) {
    try {
      const { files, size } = npmPack(dir);
      const problems = problemsIn(files, required);
      console.log(`${problems.length ? '✘' : '✔'} npm ${dir}: ${files.length} files, ${Math.round(size / 1024)} kB`);
      for (const problem of problems) console.log(`    ${problem}`);
      failed ||= problems.length > 0;
    } catch (error) { console.log(`✘ npm ${dir}: ${error.message.split('\n')[0]}`); failed = true; }
  }
  for (const dir of ['packages/callx', 'packages/callx_livekit']) {
    const { status, text, files } = pubDryRun(dir);
    const warnings = text.match(/Package has (\d+) warnings?/)?.[1] ?? '0';
    const forbidden = files.filter((file) => PUB_FORBIDDEN.some((pattern) => pattern.test(file)));
    const megabytes = pubArchiveMegabytes(text);
    // pub exits 65 with warnings; errors print "Package validation found the following error".
    const errors = /following errors?:/.test(text) && !/following potential issue/.test(text) ? 'errors' : null;
    const tooBig = megabytes > PUB_MAX_MB;
    const ok = !errors && forbidden.length === 0 && !tooBig && files.length > 0;
    console.log(`${ok ? '✔' : '✘'} pub ${dir}: exit ${status}, ${files.length} files, ${megabytes.toFixed(1)} MB, ${warnings} warning(s)${errors ? ', validation errors' : ''}`);
    for (const file of forbidden.slice(0, 8)) console.log(`    must not ship ${file}`);
    if (tooBig) console.log(`    archive is larger than ${PUB_MAX_MB} MB`);
    for (const line of text.split('\n').filter((line) => /^\* |error/i.test(line.trim())).slice(0, 12)) console.log(`    ${line.trim()}`);
    failed ||= !ok;
  }
  process.exitCode = failed ? 1 : 0;
}
