import assert from 'node:assert/strict';
import test from 'node:test';
import { disagreements, versionSites } from './release.mjs';

const files = {
  'packages/react-native/package.json': JSON.stringify({ name: '@bear-block/callx', version: '1.0.0' }),
  'packages/react-native-livekit/package.json': JSON.stringify({ name: '@bear-block/callx-livekit', version: '1.0.0',
    peerDependencies: { '@bear-block/callx': '^1.0.0', 'react-native': '>=0.76' } }),
  'packages/testkit/package.json': JSON.stringify({ name: '@bear-block/callx-testkit', version: '1.0.0' }),
  'packages/callx/pubspec.yaml': 'name: callx\nversion: 1.0.0\ndependencies:\n  flutter:\n    sdk: flutter\n',
  'packages/callx_livekit/pubspec.yaml': 'name: callx_livekit\nversion: 1.0.0\ndependencies:\n  callx: ^1.0.0\n\nflutter:\n  plugin: {}\n',
};

test('every package and internal dependency is a version site', () => {
  const sites = versionSites((path) => files[path]);
  assert.equal(sites.length, 7);
  assert.deepEqual(disagreements(sites), []);
});

test('setting a version rewrites every site and nothing else', () => {
  const sites = versionSites((path) => files[path]);
  const updated = { ...files };
  for (const site of sites) updated[site.path] = site.set(updated[site.path], '1.1.0');
  assert.deepEqual(disagreements(versionSites((path) => updated[path])), []);
  assert.equal(versionSites((path) => updated[path])[0].value, '1.1.0');
  assert.match(updated['packages/callx_livekit/pubspec.yaml'], /^ {2}callx: \^1\.1\.0$/m);
  assert.equal(JSON.parse(updated['packages/react-native-livekit/package.json']).peerDependencies['@bear-block/callx'], '^1.1.0');
  assert.match(updated['packages/callx_livekit/pubspec.yaml'], /\^1\.1\.0\n\nflutter:/);
  assert.equal(JSON.parse(updated['packages/react-native-livekit/package.json']).peerDependencies['react-native'], '>=0.76');
});

test('a lagging adapter dependency is reported', () => {
  const lagging = { ...files, 'packages/callx_livekit/pubspec.yaml': 'name: callx_livekit\nversion: 1.0.0\ndependencies:\n  callx: 0.9.0\n' };
  assert.ok(disagreements(versionSites((path) => lagging[path])).some((line) => line.includes('dependency callx: 0.9.0')));
});
