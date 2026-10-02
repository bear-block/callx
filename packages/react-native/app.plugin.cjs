const fs = require('node:fs');
const path = require('node:path');
const {createRunOncePlugin, withInfoPlist, withEntitlementsPlist, withAndroidManifest,
  withGradleProperties, withMainApplication, withAppDelegate, withAppBuildGradle,
  withDangerousMod} = require('@expo/config-plugins');
const {version} = require('./package.json');

const FIREBASE_BOM = '34.19.0';
const RNFB_SERVICE = 'io.invertase.firebase.messaging.ReactNativeFirebaseMessagingService';

/** True when the app depends on @react-native-firebase/messaging, whose FCM service Callx extends. */
function usesReactNativeFirebase(projectRoot) {
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
    return Boolean({...manifest.dependencies, ...manifest.devDependencies}['@react-native-firebase/messaging']);
  } catch { return false; }
}

function insertAfter(source, marker, anchor, text) {
  if (source.includes(marker)) return source;
  const match = source.match(anchor);
  if (!match) throw new Error(`Callx plugin cannot find ${anchor} to insert its bootstrap.`);
  const at = match.index + match[0].length;
  return `${source.slice(0, at)}\n${text}${source.slice(at)}`;
}

/** The generated FCM service, extending React Native Firebase's service when the app uses it. */
function messagingService(packageName, extendsReactNativeFirebase) {
  const template = fs.readFileSync(path.join(__dirname, 'plugin', 'CallxMessagingService.kt.template'), 'utf8');
  return template
    .replaceAll('{{PACKAGE}}', packageName)
    .replaceAll('{{BASE_CLASS}}', extendsReactNativeFirebase ? RNFB_SERVICE : 'com.google.firebase.messaging.FirebaseMessagingService')
    .replaceAll('{{OTHER_MESSAGES}}', extendsReactNativeFirebase
      ? 'Other messages and tokens go on to React Native Firebase.' : 'Other messages are ignored.')
    .replaceAll('{{FORWARD_MESSAGE}}', extendsReactNativeFirebase ? 'super.onMessageReceived(message)' : '')
    .replaceAll('{{FORWARD_TOKEN}}', extendsReactNativeFirebase ? 'super.onNewToken(token)' : '');
}

// Must match defaultConfig.minSdk in android/build.gradle.
const ANDROID_MIN_SDK = 29;

function withCallx(config, options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new Error('Callx plugin options must be an object.');
  }
  const allowed = ['microphonePermission', 'iosVoip', 'apsEnvironment', 'androidNotifications', 'bootstrap',
    'androidPush', 'video', 'cameraPermission'];
  for (const key of Object.keys(options)) {
    if (!allowed.includes(key)) throw new Error(`Unknown Callx plugin option: ${key}`);
  }
  for (const key of ['iosVoip', 'androidNotifications', 'bootstrap', 'video']) {
    if (options[key] !== undefined && typeof options[key] !== 'boolean') {
      throw new Error(`Callx ${key} must be a boolean.`);
    }
  }
  if (options.microphonePermission !== undefined &&
      (typeof options.microphonePermission !== 'string' || !options.microphonePermission.trim())) {
    throw new Error('Callx microphonePermission must be non-empty text.');
  }
  if (options.cameraPermission !== undefined &&
      (typeof options.cameraPermission !== 'string' || !options.cameraPermission.trim())) {
    throw new Error('Callx cameraPermission must be non-empty text.');
  }
  // Video calls (ADR-0010) need the camera permission; it has no effect without video.
  if (options.cameraPermission !== undefined && options.video !== true) {
    throw new Error('Callx cameraPermission requires video: true.');
  }
  if (options.apsEnvironment !== undefined && !['development', 'production'].includes(options.apsEnvironment)) {
    throw new Error('Callx apsEnvironment must be development or production.');
  }
  if (options.apsEnvironment && options.iosVoip !== true) {
    throw new Error('Callx apsEnvironment requires iosVoip: true.');
  }
  if (options.androidPush !== undefined && !['fcm', 'none'].includes(options.androidPush)) {
    throw new Error('Callx androidPush must be fcm or none.');
  }
  // The app starts the native pipeline itself when bootstrap is false.
  const bootstrap = options.bootstrap !== false;
  const androidPush = options.androidPush ?? 'none';
  if (androidPush === 'fcm' && !bootstrap) throw new Error('Callx androidPush: fcm requires bootstrap.');
  if (bootstrap) config = withBootstrap(config, {iosVoip: options.iosVoip === true, fcm: androidPush === 'fcm'});
  if (androidPush === 'fcm') config = withFcmService(config);
  config = withInfoPlist(config, mod => {
    if (options.microphonePermission !== undefined || !mod.modResults.NSMicrophoneUsageDescription) {
      mod.modResults.NSMicrophoneUsageDescription = options.microphonePermission ??
        'Allow this app to use your microphone for voice calls.';
    }
    if (options.video === true && (options.cameraPermission !== undefined || !mod.modResults.NSCameraUsageDescription)) {
      mod.modResults.NSCameraUsageDescription = options.cameraPermission ??
        'Allow this app to use your camera for video calls.';
    }
    const modes = ['audio', ...(options.iosVoip === true ? ['voip'] : [])];
    mod.modResults.UIBackgroundModes = [...new Set([...(mod.modResults.UIBackgroundModes ?? []), ...modes])];
    return mod;
  });
  if (options.apsEnvironment) {
    config = withEntitlementsPlist(config, mod => {
      const current = mod.modResults['aps-environment'];
      if (current && current !== options.apsEnvironment) {
        throw new Error('Callx apsEnvironment conflicts with the existing aps-environment entitlement.');
      }
      mod.modResults['aps-environment'] = options.apsEnvironment;
      return mod;
    });
  }
  config = withGradleProperties(config, mod => {
    const key = 'android.minSdkVersion';
    const entry = mod.modResults.find(item => item.type === 'property' && item.key === key);
    const current = Number.parseInt(entry?.value ?? '', 10);
    if (!entry) mod.modResults.push({type: 'property', key, value: String(ANDROID_MIN_SDK)});
    else if (!(current >= ANDROID_MIN_SDK)) entry.value = String(ANDROID_MIN_SDK);
    return mod;
  });
  return withAndroidManifest(config, mod => {
    const permissions = ['android.permission.INTERNET', 'android.permission.RECORD_AUDIO',
      'android.permission.MANAGE_OWN_CALLS'];
    if (options.androidNotifications === true) permissions.push('android.permission.POST_NOTIFICATIONS');
    if (options.video === true) permissions.push('android.permission.CAMERA');
    const entries = mod.modResults.manifest['uses-permission'] ??= [];
    for (const name of permissions) {
      if (!entries.some(entry => entry.$?.['android:name'] === name)) {
        entries.push({$: {'android:name': name}});
      }
    }
    if (options.video === true) {
      // The camera permission implies a required camera; keep audio-only phones able to install.
      const features = mod.modResults.manifest['uses-feature'] ??= [];
      if (!features.some(entry => entry.$?.['android:name'] === 'android.hardware.camera')) {
        features.push({$: {'android:name': 'android.hardware.camera', 'android:required': 'false'}});
      }
    }
    return mod;
  });
}

/**
 * Starts CallxBootstrap from MainApplication.onCreate and application(_:didFinishLaunchingWithOptions:),
 * before any push can arrive (ADR-0009). A device without Telecom, or two media adapters, leaves
 * calling unavailable instead of crashing the app.
 */
function withBootstrap(config, {iosVoip, fcm}) {
  config = withMainApplication(config, mod => {
    if (mod.modResults.language !== 'kt') throw new Error('Callx bootstrap requires a Kotlin MainApplication.');
    mod.modResults.contents = bootstrapMainApplication(mod.modResults.contents, fcm ? config.android?.package : null);
    return mod;
  });
  return withAppDelegate(config, mod => {
    if (mod.modResults.language !== 'swift') throw new Error('Callx bootstrap requires a Swift AppDelegate.');
    mod.modResults.contents = bootstrapAppDelegate(mod.modResults.contents, iosVoip);
    return mod;
  });
}

/** Inserts the Android bootstrap after super.onCreate(); with FCM, also reads the token at launch. */
function bootstrapMainApplication(source, fcmPackage) {
  const lines = [
    '    // Callx: the native call pipeline, before any push can arrive.',
    '    try { dev.callx.reactnative.CallxModule.bootstrap(this) } catch (error: Exception) {',
    '      android.util.Log.w("Callx", "Calling is unavailable on this device", error)',
    '    }',
  ];
  if (fcmPackage) lines.push(`    ${fcmPackage}.CallxMessagingService.registerToken(this)`);
  return insertAfter(source, 'CallxModule.bootstrap(this)', /super\.onCreate\(\)/, lines.join('\n'));
}

/** Inserts the iOS bootstrap at the start of didFinishLaunching; PushKit only with iosVoip. */
function bootstrapAppDelegate(source, iosVoip) {
  source = insertAfter(source, 'import callx_react_native', /^import React$/m, 'import callx_react_native');
  return insertAfter(source, 'CallxReactNativeHost.bootstrap', /didFinishLaunchingWithOptions launchOptions:[^{]*\{/, [
    '    // Callx: the native call pipeline, before PushKit can deliver.',
    '    var callxConfig = CallxBootstrapConfig()',
    `    callxConfig.startPushRegistry = ${iosVoip}`,
    '    do { try CallxReactNativeHost.bootstrap(callxConfig) } catch { NSLog("Callx: calling is unavailable: %@", "\\(error)") }',
  ].join('\n'));
}

/** Generates CallxMessagingService, which forwards Callx invitations and reports the FCM token. */
function withFcmService(config) {
  const packageName = config.android?.package;
  if (!packageName) throw new Error('Callx androidPush: fcm requires android.package.');
  if (!config.android?.googleServicesFile) {
    console.warn('Callx androidPush: fcm needs android.googleServicesFile, or FCM cannot deliver invitations.');
  }
  config = withAppBuildGradle(config, mod => {
    mod.modResults.contents = insertAfter(mod.modResults.contents, '// Callx FCM', /dependencies\s*\{/, [
      '    // Callx FCM: CallxMessagingService forwards invitations to the native ingress.',
      `    implementation(platform("com.google.firebase:firebase-bom:${FIREBASE_BOM}"))`,
      '    implementation("com.google.firebase:firebase-messaging")',
    ].join('\n'));
    return mod;
  });
  config = withDangerousMod(config, ['android', mod => {
    const directory = path.join(mod.modRequest.platformProjectRoot, 'app/src/main/java', ...packageName.split('.'));
    fs.mkdirSync(directory, {recursive: true});
    fs.writeFileSync(path.join(directory, 'CallxMessagingService.kt'),
      messagingService(packageName, usesReactNativeFirebase(mod.modRequest.projectRoot)));
    return mod;
  }]);
  return withAndroidManifest(config, mod => {
    const manifest = mod.modResults.manifest;
    const application = manifest.application[0];
    const services = application.service ??= [];
    const name = `${packageName}.CallxMessagingService`;
    if (!services.some(service => service.$['android:name'] === name)) {
      services.push({$: {'android:name': name, 'android:exported': 'false'},
        'intent-filter': [{action: [{$: {'android:name': 'com.google.firebase.MESSAGING_EVENT'}}]}]});
    }
    // One service receives FCM messages; CallxMessagingService extends React Native Firebase's and replaces it.
    if (usesReactNativeFirebase(mod.modRequest.projectRoot) &&
        !services.some(service => service.$['android:name'] === RNFB_SERVICE)) {
      manifest.$['xmlns:tools'] ??= 'http://schemas.android.com/tools';
      services.push({$: {'android:name': RNFB_SERVICE, 'tools:node': 'remove'}});
    }
    return mod;
  });
}

module.exports = createRunOncePlugin(withCallx, '@bear-block/callx', version);
Object.assign(module.exports, {messagingService, bootstrapMainApplication, bootstrapAppDelegate});
