import type { ConfigPlugin } from '@expo/config-plugins';
import { createRunOncePlugin } from '@expo/config-plugins';
import { withCallxCopyAssets } from './android/copyAssets';
import { withCallxModifyMainActivity } from './android/modifyMainActivity';
import { withCallxAndroidManifest } from './android/manifest';
import { withCallxInfoPlist } from './ios/infoPlist';
import { withCallxCopyAssets as withCallxCopyAssetsIOS } from './ios/copyAssets';

export interface CallxPluginOptions {
  mode?: 'native' | 'js';
  package: string;
}

const withCallx: ConfigPlugin<CallxPluginOptions> = (config, options) => {
  if (!options?.package) {
    throw new Error(
      '[callx] Package option is required. Please provide the Android package name.'
    );
  }

  const { mode = 'native', package: packageName } = options;
  console.log(`[callx] Initializing Callx plugin in ${mode} mode`);

  // Android plugins - always copy assets and modify MainActivity
  config = withCallxCopyAssets(config);
  config = withCallxModifyMainActivity(config, { package: packageName });

  // Android manifest - only add FCM service in native mode
  if (mode === 'native') {
    config = withCallxAndroidManifest(config);
  }

  // iOS plugins
  config = withCallxInfoPlist(config);
  config = withCallxCopyAssetsIOS(config);

  return config;
};

// Create run-once plugin to prevent duplicate execution
const pak = require('../../package.json');
export default createRunOncePlugin(withCallx, pak.name, pak.version);
