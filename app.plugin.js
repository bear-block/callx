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

function modifyMainActivity(projectRoot) {
  const mainActivityPath = path.join(projectRoot, 'android/app/src/main/java');

  // Tìm file MainActivity.kt
  let mainActivityFile = null;
  const findMainActivity = (dir) => {
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
          findMainActivity(fullPath);
        } else if (file === 'MainActivity.kt') {
          mainActivityFile = fullPath;
          return;
        }
      }
    }
  };

  findMainActivity(mainActivityPath);

  if (!mainActivityFile) {
    throw new Error(
      '[callx] MainActivity.kt not found. Callx requires MainActivity to extend CallxReactActivity.'
    );
  }

  let content = fs.readFileSync(mainActivityFile, 'utf8');

  // Check if already extends CallxReactActivity
  if (content.includes('CallxReactActivity')) {
    console.log('[callx] MainActivity already extends CallxReactActivity. ✓');
    return;
  }

  // Add import
  if (!content.includes('import com.callx.CallxReactActivity')) {
    content = content.replace(
      /import com\.facebook\.react\.ReactActivity/,
      'import com.facebook.react.ReactActivity\nimport com.callx.CallxReactActivity'
    );
  }

  // Change inheritance from ReactActivity to CallxReactActivity
  content = content.replace(
    /class\s+MainActivity\s*:\s*ReactActivity/,
    'class MainActivity : CallxReactActivity'
  );

  // Add explanatory comment
  const comment = `
/**
 * MainActivity - REQUIRED: Extends CallxReactActivity for automatic lockscreen handling
 * This is required for Callx to work properly with lockscreen notifications.
 */`;

  if (
    !content.includes(
      'Extends CallxReactActivity for automatic lockscreen handling'
    )
  ) {
    content = content.replace(
      /class\s+MainActivity\s*:\s*CallxReactActivity/,
      `${comment}\nclass MainActivity : CallxReactActivity`
    );
  }

  fs.writeFileSync(mainActivityFile, content);
  console.log(
    `[callx] ✓ Modified ${mainActivityFile} to extend CallxReactActivity (REQUIRED)`
  );
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
      modifyMainActivity(modConfig.projectRoot);
      return modConfig;
    },
  ]);
  config = withCallxAndroidManifest(config);
  config = withCallxProjectBuildGradle(config);
  config = withCallxAppBuildGradle(config);
  return config;
};

module.exports = withCallx;
