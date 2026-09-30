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

test('plugin raises Android minSdk to the library floor without lowering it', async () => {
  const {withGradleProperties} = require('@expo/config-plugins');
  async function minSdk(existing) {
    const projectRoot = mkdtempSync(join(tmpdir(), 'callx-plugin-'));
    try {
      let config = plugin({name: 'Callx test', slug: 'callx-test', android: {package: 'dev.callx.test'}}, {});
      // Mods added later run first, so this seeds the value Callx then sees.
      if (existing) config = withGradleProperties(config, mod => {
        mod.modResults.push({type: 'property', key: 'android.minSdkVersion', value: existing});
        return mod;
      });
      const result = await compileModsAsync(config, {projectRoot, introspect: true,
        ignoreExistingNativeFiles: true, platforms: ['android']});
      return result._internal.modResults.android.gradleProperties
        .filter(item => item.type === 'property' && item.key === 'android.minSdkVersion')
        .map(item => item.value);
    } finally {
      rmSync(projectRoot, {recursive: true, force: true});
    }
  }
  assert.deepEqual(await minSdk(), ['29']);
  assert.deepEqual(await minSdk('24'), ['29']);
  assert.deepEqual(await minSdk('31'), ['31']);
});

const MAIN_APPLICATION = `class MainApplication : Application(), ReactApplication {
  override fun onCreate() {
    super.onCreate()
    loadReactNative(this)
  }
}`;
const APP_DELEGATE = `internal import Expo
import React
import ReactAppDependencyProvider

@main
class AppDelegate: ExpoAppDelegate {
  public override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    let delegate = ReactNativeDelegate()
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }
}`;

test('bootstrap runs first in MainApplication and AppDelegate, once', () => {
  const kotlin = plugin.bootstrapMainApplication(MAIN_APPLICATION, null);
  assert.match(kotlin, /super\.onCreate\(\)\n\s+\/\/ Callx[\s\S]*CallxModule\.bootstrap\(this\)[\s\S]*loadReactNative/);
  assert.doesNotMatch(kotlin, /registerToken/);
  assert.equal(plugin.bootstrapMainApplication(kotlin, null), kotlin);
  assert.match(plugin.bootstrapMainApplication(MAIN_APPLICATION, 'com.acme.app'),
    /com\.acme\.app\.CallxMessagingService\.registerToken\(this\)/);
  const swift = plugin.bootstrapAppDelegate(APP_DELEGATE, true);
  assert.match(swift, /import React\nimport callx_react_native/);
  assert.match(swift, /-> Bool \{\n\s+\/\/ Callx[\s\S]*startPushRegistry = true[\s\S]*CallxReactNativeHost\.bootstrap[\s\S]*let delegate/);
  assert.equal(plugin.bootstrapAppDelegate(swift, true), swift);
  assert.match(plugin.bootstrapAppDelegate(APP_DELEGATE, false), /startPushRegistry = false/);
});

test('the FCM service extends React Native Firebase when the app uses it', () => {
  const standalone = plugin.messagingService('com.acme.app', false);
  assert.match(standalone, /^package com\.acme\.app$/m);
  assert.match(standalone, /: com\.google\.firebase\.messaging\.FirebaseMessagingService\(\)/);
  assert.doesNotMatch(standalone, /super\.onMessageReceived|\{\{/);
  const chained = plugin.messagingService('com.acme.app', true);
  assert.match(chained, /: io\.invertase\.firebase\.messaging\.ReactNativeFirebaseMessagingService\(\)/);
  assert.match(chained, /super\.onMessageReceived\(message\)/);
  assert.match(chained, /super\.onNewToken\(token\)/);
});

test('plugin validates bootstrap and push options', () => {
  for (const options of [{bootstrap: 'yes'}, {androidPush: 'apns'}, {androidPush: 'fcm', bootstrap: false}]) {
    assert.throws(() => plugin({name: 'Test', slug: 'test', android: {package: 'dev.callx.test'}}, options), /Callx/);
  }
});
