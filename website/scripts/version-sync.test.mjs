// Every place that names the latest release or contract must match the packages and manifest.
import assert from 'node:assert/strict';
import {readdirSync, readFileSync} from 'node:fs';
import test from 'node:test';

const root = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const json = (path) => JSON.parse(read(path));
const version = json('packages/react-native/package.json').version;
const contract = json('contracts/v0/manifest.json').contractVersion;
const anchor = `release-${version.replaceAll('.', '-')}`;

test('all packages share one version', () => {
  const versions = {
    '@bear-block/callx': version,
    '@bear-block/callx-livekit': json('packages/react-native-livekit/package.json').version,
    '@bear-block/callx-testkit': json('packages/testkit/package.json').version,
    callx: read('packages/callx/pubspec.yaml').match(/^version: (.+)$/m)[1],
    callx_livekit: read('packages/callx_livekit/pubspec.yaml').match(/^version: (.+)$/m)[1],
  };
  for (const [name, value] of Object.entries(versions)) assert.equal(value, version, name);
});

test('the changelog has an entry for the latest release', () => {
  assert.match(read('website/project/changelog.md'), new RegExp(`^## ${version.replaceAll('.', '\\.')} — .*\\{#${anchor}\\}$`, 'm'));
});

test('pages that name the latest release name the current one', () => {
  assert.match(read('website/index.md'), new RegExp(`Latest release: ${version}\\b[\\s\\S]*#${anchor}`));
  assert.match(read('website/project/status.md'), new RegExp(`\\*\\*Packages:\\*\\* \`${version}\` · \\*\\*Contract:\\*\\* \`${contract}\``));
  assert.match(read('README.md'), new RegExp(`Version \`${version}\`[\\s\\S]{0,120}contract \`${contract}\``));
  assert.match(read('website/reference/packages.md'), new RegExp(`current ${version} packages use \\[contract \`${contract}\`\\]`));
});

test('no page outside the changelog announces an older release as the latest', () => {
  const pages = readdirSync(new URL('website/', root), {recursive: true})
    .filter((path) => path.endsWith('.md') && !path.includes('node_modules') && path !== 'project/changelog.md');
  for (const page of pages) {
    for (const [, value] of read(`website/${page}`).matchAll(/[Ll]atest (?:package )?release:? `?v?(\d+\.\d+\.\d+)/g)) {
      assert.equal(value, version, page);
    }
  }
});

test('pages that name the contract name the current one', () => {
  const pages = ['website/why.md', 'website/compare.md', 'website/reference/contract.md'];
  for (const page of pages) assert.ok(read(page).includes(contract), page);
  const reference = read('website/reference/javascript.md');
  assert.ok(reference.includes(`\`CONTRACT_VERSION\` | \`'${contract}'\``));
  assert.ok(!/contractVersion: '(?!\d)/.test(reference));
  for (const [, value] of reference.matchAll(/contractVersion: '([0-9.]+)'/g)) assert.equal(value, contract);
  assert.ok(read('packages/react-native/src/index.ts').includes(`CONTRACT_VERSION = '${contract}'`));
  assert.ok(read('packages/callx/lib/callx.dart').includes(`contractVersion = '${contract}'`));
});

test('no page still calls released APIs unpublished', () => {
  for (const page of ['dart', 'javascript', 'native', 'contract']) {
    const text = read(`website/reference/${page}.md`);
    assert.doesNotMatch(text, /Publication is pending|Prepared \d/, page);
  }
});
