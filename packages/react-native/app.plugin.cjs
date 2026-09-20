const {createRunOncePlugin, withInfoPlist, withEntitlementsPlist, withAndroidManifest} = require('@expo/config-plugins');
const {version} = require('./package.json');

function withCallx(config, options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new Error('Callx plugin options must be an object.');
  }
  const allowed = ['microphonePermission', 'iosVoip', 'apsEnvironment', 'androidNotifications'];
  for (const key of Object.keys(options)) {
    if (!allowed.includes(key)) throw new Error(`Unknown Callx plugin option: ${key}`);
  }
  for (const key of ['iosVoip', 'androidNotifications']) {
    if (options[key] !== undefined && typeof options[key] !== 'boolean') {
      throw new Error(`Callx ${key} must be a boolean.`);
    }
  }
  if (options.microphonePermission !== undefined &&
      (typeof options.microphonePermission !== 'string' || !options.microphonePermission.trim())) {
    throw new Error('Callx microphonePermission must be non-empty text.');
  }
  if (options.apsEnvironment !== undefined && !['development', 'production'].includes(options.apsEnvironment)) {
    throw new Error('Callx apsEnvironment must be development or production.');
  }
  if (options.apsEnvironment && options.iosVoip !== true) {
    throw new Error('Callx apsEnvironment requires iosVoip: true.');
  }
  config = withInfoPlist(config, mod => {
    if (options.microphonePermission !== undefined || !mod.modResults.NSMicrophoneUsageDescription) {
      mod.modResults.NSMicrophoneUsageDescription = options.microphonePermission ??
        'Allow this app to use your microphone for voice calls.';
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
  return withAndroidManifest(config, mod => {
    const permissions = ['android.permission.INTERNET', 'android.permission.RECORD_AUDIO',
      'android.permission.MANAGE_OWN_CALLS'];
    if (options.androidNotifications === true) permissions.push('android.permission.POST_NOTIFICATIONS');
    const entries = mod.modResults.manifest['uses-permission'] ??= [];
    for (const name of permissions) {
      if (!entries.some(entry => entry.$?.['android:name'] === name)) {
        entries.push({$: {'android:name': name}});
      }
    }
    return mod;
  });
}

module.exports = createRunOncePlugin(withCallx, '@bear-block/callx', version);
