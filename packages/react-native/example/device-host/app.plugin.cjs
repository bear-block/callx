// Example-only native host. Keep bootstrap out of JS so React reloads retain the native call.
const fs = require('node:fs');
const path = require('node:path');
const {withMainApplication, withMainActivity, withAppDelegate, withAppBuildGradle, withDangerousMod,
  withXcodeProject, withAndroidManifest, withInfoPlist, IOSConfig} = require('@expo/config-plugins');

function insertOnce(source, marker, anchor, replacement) {
  if (source.includes(marker)) return source;
  if (!source.includes(anchor)) throw new Error(`Callx example cannot find bootstrap anchor: ${anchor}`);
  return source.replace(anchor, replacement);
}

// Device-trial Firebase config, ignored by Git. Without it the example builds but cannot receive FCM.
const googleServices = path.join(__dirname, '../../../secrets/google-services.json');

module.exports = config => {
  if (fs.existsSync(googleServices)) {
    config.android = {...config.android, googleServicesFile: googleServices};
  }
  config = withMainApplication(config, mod => {
    if (mod.modResults.language !== 'kt') throw new Error('Callx example requires a Kotlin MainApplication.');
    let source = mod.modResults.contents;
    source = insertOnce(source, 'dev.callx.preview.rn.device.DeviceHostPackage()',
      'PackageList(this).packages.apply {',
      'PackageList(this).packages.apply {\n          add(dev.callx.preview.rn.device.DeviceHostPackage())');
    source = insertOnce(source, 'DeviceHost.bootstrap(this)', 'super.onCreate()',
      'super.onCreate()\n    dev.callx.preview.rn.device.DeviceHost.bootstrap(this)');
    mod.modResults.contents = source;
    return mod;
  });
  config = withAppBuildGradle(config, mod => {
    mod.modResults.contents = insertOnce(mod.modResults.contents, '// Callx device host dependencies',
      'dependencies {', 'dependencies {\n    // Callx device host dependencies\n' +
      '    implementation("androidx.core:core-telecom:1.0.1")\n' +
      '    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.8.1")\n' +
      '    implementation(platform("com.google.firebase:firebase-bom:34.19.0"))\n' +
      '    implementation("com.google.firebase:firebase-messaging")');
    return mod;
  });
  config = withMainActivity(config, mod => {
    if (mod.modResults.language !== 'kt') throw new Error('Callx example requires a Kotlin MainActivity.');
    const show = 'dev.callx.telecom.CallxLockScreen.onIntent(this, intent)';
    let source = insertOnce(mod.modResults.contents, show, 'super.onCreate(null)', `super.onCreate(null)\n    ${show}`);
    source = insertOnce(source, 'override fun onNewIntent', '  override fun getMainComponentName()',
      `  override fun onNewIntent(intent: android.content.Intent) {\n    super.onNewIntent(intent)\n    setIntent(intent)\n    ${show}\n  }\n\n  override fun getMainComponentName()`);
    mod.modResults.contents = source;
    return mod;
  });
  config = withAndroidManifest(config, mod => {
    const main = mod.modResults.manifest.application?.[0]?.activity?.find(a => a.$['android:name'] === '.MainActivity');
    if (!main) throw new Error('Callx example requires MainActivity.');
    // Lock-screen presence is set per call by CallxLockScreen, never statically.
    delete main.$['android:showWhenLocked'];
    delete main.$['android:turnScreenOn'];
    const application = mod.modResults.manifest.application[0];
    // The device trial reaches the local console through adb reverse in bundled builds too.
    application.$['android:networkSecurityConfig'] = '@xml/callx_trial_network_security';
    const service = 'dev.callx.preview.rn.device.DeviceHostMessagingService';
    application.service = (application.service ?? []).filter(s => s.$['android:name'] !== service);
    application.service.push({$: {'android:name': service, 'android:exported': 'false'},
      'intent-filter': [{action: [{$: {'android:name': 'com.google.firebase.MESSAGING_EVENT'}}]}]});
    return mod;
  });
  config = withDangerousMod(config, ['android', mod => {
    const resources = path.join(mod.modRequest.platformProjectRoot, 'app/src/main/res/xml');
    fs.mkdirSync(resources, {recursive: true});
    fs.writeFileSync(path.join(resources, 'callx_trial_network_security.xml'),
      '<network-security-config><domain-config cleartextTrafficPermitted="true">' +
      '<domain includeSubdomains="false">127.0.0.1</domain><domain includeSubdomains="false">localhost</domain>' +
      '</domain-config></network-security-config>\n');
    const destination = path.join(mod.modRequest.platformProjectRoot, 'app/src/main/java/dev/callx/preview/rn/device');
    fs.mkdirSync(destination, {recursive: true});
    for (const file of ['DeviceHost.kt', 'DeviceHostModule.kt', 'DeviceHostMessagingService.kt', 'ConsoleReporter.kt']) {
      fs.copyFileSync(path.join(__dirname, 'android', file), path.join(destination, file));
    }
    return mod;
  }]);
  config = withAppDelegate(config, mod => {
    if (mod.modResults.language !== 'swift') throw new Error('Callx example requires a Swift AppDelegate.');
    mod.modResults.contents = insertOnce(mod.modResults.contents, 'DeviceHost.shared.start()',
      'let delegate = ReactNativeDelegate()', 'DeviceHost.shared.start()\n    let delegate = ReactNativeDelegate()');
    return mod;
  });
  config = withInfoPlist(config, mod => {
    // The Simulator reaches the Mac at 127.0.0.1; set the Mac's address for an iPhone.
    mod.modResults.CallxConsoleURL ??= 'http://127.0.0.1:8787';
    mod.modResults.NSAppTransportSecurity = {...mod.modResults.NSAppTransportSecurity, NSAllowsLocalNetworking: true};
    mod.modResults.NSLocalNetworkUsageDescription ??= 'Device trials reach the call console and media server on this network.';
    return mod;
  });
  return withXcodeProject(config, mod => {
    const name = mod.modRequest.projectName ?? IOSConfig.XcodeUtils.getProjectName(mod.modRequest.projectRoot);
    for (const file of ['DeviceHost.swift', 'DeviceHostBridge.m', 'ConsoleReporter.swift']) {
      fs.copyFileSync(path.join(__dirname, 'ios', file), path.join(mod.modRequest.platformProjectRoot, name, file));
      const filepath = `${name}/${file}`;
      if (!mod.modResults.hasFile(filepath)) {
        IOSConfig.XcodeUtils.addBuildSourceFileToGroup({filepath, groupName: name, project: mod.modResults});
      }
    }
    return mod;
  });
};
