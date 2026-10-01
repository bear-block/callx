#!/usr/bin/env node
// Keeps every published package on one version (ADR-0009: core and adapters release in lockstep).
//
//   npm run release:version -- 0.1.0    set the version everywhere
//   npm run release:check               fail if any package or internal dependency disagrees
//
// Podspecs read their version from package.json or pubspec.yaml, so they are never edited here.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const NPM = ['packages/react-native', 'packages/react-native-livekit', 'packages/testkit'];
const PUB = ['packages/callx', 'packages/callx_livekit'];
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

/** Every place a release version lives, as [label, current value, setter]. */
export function versionSites(read = (path) => readFileSync(join(root, path), 'utf8')) {
  const sites = [];
  for (const dir of NPM) {
    const path = `${dir}/package.json`;
    const manifest = JSON.parse(read(path));
    sites.push({ label: `${manifest.name} version`, path, value: manifest.version,
      set: (text, version) => replaceJson(text, (json) => { json.version = version; }) });
    if (manifest.peerDependencies?.['@bear-block/callx']) {
      // Adapters accept later core versions of the same major (ADR-0009); apiVersion guards the rest.
      sites.push({ label: `${manifest.name} peer @bear-block/callx`, path, value: manifest.peerDependencies['@bear-block/callx'],
        set: (text, version) => replaceJson(text, (json) => { json.peerDependencies['@bear-block/callx'] = `^${version}`; }) });
    }
  }
  for (const dir of PUB) {
    const path = `${dir}/pubspec.yaml`;
    const text = read(path);
    const name = text.match(/^name:\s*(\S+)/m)[1];
    sites.push({ label: `${name} version`, path, value: text.match(/^version:\s*(\S+)/m)[1],
      set: (source, version) => source.replace(/^version:\s*\S+/m, `version: ${version}`) });
    const dependency = text.match(/^ {2}callx:[ \t]*(\S+)[ \t]*$/m);
    if (dependency) {
      sites.push({ label: `${name} dependency callx`, path, value: dependency[1],
        set: (source, version) => source.replace(/^( {2}callx:[ \t]*)\S+[ \t]*$/m, `$1^${version}`) });
    }
    // The plugin's Android library declares its own version.
    const gradlePath = `${dir}/android/build.gradle`;
    let gradle;
    try { gradle = read(gradlePath); } catch { gradle = undefined; }
    const gradleVersion = gradle?.match(/^version = "([^"]+)"/m);
    if (gradleVersion) {
      sites.push({ label: `${name} Android library version`, path: gradlePath, value: gradleVersion[1],
        set: (source, version) => source.replace(/^version = "[^"]+"/m, `version = "${version}"`) });
    }
  }
  return sites;
}

function replaceJson(text, change) {
  const json = JSON.parse(text); change(json);
  return `${JSON.stringify(json, null, 2)}\n`;
}

/** The disagreements between sites, as messages; empty when every site has one version. */
export function disagreements(sites) {
  const versions = [...new Set(sites.map((site) => site.value.replace(/^\^/, '')))];
  if (versions.length <= 1) return [];
  return sites.map((site) => `${site.label}: ${site.value} (${site.path})`);
}

function main([command, version]) {
  if (command === 'check') {
    const problems = disagreements(versionSites());
    if (problems.length) { console.error(`Package versions disagree:\n  ${problems.join('\n  ')}`); process.exitCode = 1; return; }
    console.log(`All packages at ${versionSites()[0].value}; adapters depend on ^${versionSites()[0].value}.`);
    return;
  }
  if (command === 'version' && SEMVER.test(version ?? '')) {
    for (const site of versionSites()) {
      const path = join(root, site.path);
      writeFileSync(path, site.set(readFileSync(path, 'utf8'), version));
    }
    console.log(`Set ${version} in ${[...new Set(versionSites().map((site) => site.path))].join(', ')}.`);
    return;
  }
  console.error('Usage: release.mjs check | version <semver>'); process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) main(process.argv.slice(2));
