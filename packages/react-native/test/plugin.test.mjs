import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const require = createRequire(import.meta.url);
const plugin = require('@bear-block/callx/app.plugin');
const {compileModsAsync} = require('@expo/config-plugins');

async function evaluate(options, extra = {}) {
  const projectRoot = mkdtempSync(join(tmpdir(), 'callx-plugin-'));
  try {
    const config = plugin({name: 'Callx test', slug: 'callx-test',
      ios: {bundleIdentifier: 'dev.callx.test'},
      android: {package: 'dev.callx.test'}, ...extra}, options);
    const result = await compileModsAsync(config, {projectRoot, introspect: true,
      ignoreExistingNativeFiles: true, platforms: ['ios', 'android']});
    return result._internal.modResults;
  } finally {
    rmSync(projectRoot, {recursive: true, force: true});
  }
}

test('plugin merges existing configuration without duplicate permissions or modes', async () => {
  const result = await evaluate({iosVoip: true, androidNotifications: true}, {
    ios: {bundleIdentifier: 'dev.callx.test', infoPlist: {
      NSMicrophoneUsageDescription: 'Existing explanation', UIBackgroundModes: ['fetch', 'audio'],
    }},
    android: {package: 'dev.callx.test', permissions: ['android.permission.RECORD_AUDIO']},
  });
  assert.equal(result.ios.infoPlist.NSMicrophoneUsageDescription, 'Existing explanation');
  assert.deepEqual(result.ios.infoPlist.UIBackgroundModes, ['fetch', 'audio', 'voip']);
  const names = result.android.manifest.manifest['uses-permission'].map(p => p.$['android:name']);
  assert.equal(names.filter(n => n === 'android.permission.RECORD_AUDIO').length, 1);
  assert.ok(names.includes('android.permission.MANAGE_OWN_CALLS'));
  assert.ok(names.includes('android.permission.POST_NOTIFICATIONS'));
  assert.equal(result.ios.entitlements['aps-environment'], undefined);
});

test('plugin explicitly enables APNs environment and custom microphone message', async () => {
  const result = await evaluate({iosVoip: true, apsEnvironment: 'production', microphonePermission: 'Voice calls'});
  assert.equal(result.ios.entitlements['aps-environment'], 'production');
  assert.equal(result.ios.infoPlist.NSMicrophoneUsageDescription, 'Voice calls');
});

test('plugin defaults do not opt into VoIP push or notification permission', async () => {
  const result = await evaluate({});
  assert.deepEqual(result.ios.infoPlist.UIBackgroundModes, ['audio']);
  assert.ok(!result.android.manifest.manifest['uses-permission'].some(p =>
    p.$['android:name'] === 'android.permission.POST_NOTIFICATIONS'));
});

test('plugin rejects invalid options and conflicting entitlements', async () => {
  for (const options of [{iosVoip: 'true'}, {apsEnvironment: 'production'},
    {iosVoip: true, apsEnvironment: 'invalid'}, {microphonePermission: ''}, {unknown: true}]) {
    assert.throws(() => plugin({name: 'Test', slug: 'test'}, options), /Callx/);
  }
  await assert.rejects(evaluate({iosVoip: true, apsEnvironment: 'production'}, {
    ios: {bundleIdentifier: 'dev.callx.test', entitlements: {'aps-environment': 'development'}},
  }), /conflicts/);
});
