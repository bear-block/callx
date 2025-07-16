const {
  withDangerousMod,
  withAndroidManifest,
  withProjectBuildGradle,
  withAppBuildGradle,
} = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const CALLX_JSON = 'callx.json';
const ANDROID_ASSETS_PATH = 'android/app/src/main/assets';
const FCM_SERVICE = {
  'android:name': 'com.callx.CallxFirebaseMessagingService',
  'android:directBootAware': 'true',
  'android:exported': 'false',
};

function ensureDirSync(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function copyCallxJson(projectRoot) {
  const src = path.join(projectRoot, CALLX_JSON);
  const destDir = path.join(projectRoot, ANDROID_ASSETS_PATH);
  const dest = path.join(destDir, CALLX_JSON);
  if (fs.existsSync(src)) {
    ensureDirSync(destDir);
    fs.copyFileSync(src, dest);
    console.log(`[callx] Copied ${CALLX_JSON} to ${dest}`);
  } else {
    console.warn(
      `[callx] ${CALLX_JSON} not found in project root. Skipping copy.`
    );
  }
}

function withCallxAndroidManifest(config) {
  return withAndroidManifest(config, (modConfig) => {
    const app = modConfig.modResults.manifest.application?.[0];
    if (!app) return modConfig;
    // Check if service already exists
    const exists = (app.service || []).some(
      (s) => s.$ && s.$['android:name'] === FCM_SERVICE['android:name']
    );
    if (!exists) {
      app.service = app.service || [];
      app.service.push({
        '$': FCM_SERVICE,
        'intent-filter': [
          {
            $: { 'android:priority': '1' },
            action: [
              { $: { 'android:name': 'com.google.firebase.MESSAGING_EVENT' } },
            ],
          },
        ],
      });
    }
    return modConfig;
  });
}

function withCallxProjectBuildGradle(config) {
  return withProjectBuildGradle(config, (modConfig) => {
    const classpath = `classpath 'com.google.gms:google-services:4.4.0'`;
    if (!modConfig.modResults.contents.includes(classpath)) {
      modConfig.modResults.contents = modConfig.modResults.contents.replace(
        /(dependencies\s*{)/,
        `$1\n        ${classpath}`
      );
    }
    return modConfig;
  });
}

function withCallxAppBuildGradle(config) {
  return withAppBuildGradle(config, (modConfig) => {
    // Add plugin
    if (
      !modConfig.modResults.contents.includes('com.google.gms.google-services')
    ) {
      modConfig.modResults.contents =
        `apply plugin: 'com.google.gms.google-services'\n` +
        modConfig.modResults.contents;
    }
    // Add Firebase dependencies
    const bom = `implementation platform('com.google.firebase:firebase-bom:33.16.0')`;
    const messaging = `implementation 'com.google.firebase:firebase-messaging'`;
    const analytics = `implementation 'com.google.firebase:firebase-analytics'`;
    if (!modConfig.modResults.contents.includes(bom)) {
      modConfig.modResults.contents = modConfig.modResults.contents.replace(
        /(dependencies\s*{)/,
        `$1\n    ${bom}\n    ${messaging}\n    ${analytics}`
      );
    }
    return modConfig;
  });
}

const withCallx = (config) => {
  config = withDangerousMod(config, [
    'android',
    async (modConfig) => {
      copyCallxJson(modConfig.projectRoot);
      return modConfig;
    },
  ]);
  config = withCallxAndroidManifest(config);
  config = withCallxProjectBuildGradle(config);
  config = withCallxAppBuildGradle(config);
  return config;
};

module.exports = withCallx;
