import type { ConfigPlugin } from '@expo/config-plugins';
import { createRunOncePlugin } from '@expo/config-plugins';
import { withCallxCopyAssets } from './android/copyAssets';
import { withCallxModifyMainActivity } from './android/modifyMainActivity';
// Removed manifest modification from plugin to avoid duplication; library declares service
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

  const { package: packageName } = options;
  // Intentionally no general logs: keep output minimal

  // Android plugins - always copy assets and modify MainActivity
  config = withCallxCopyAssets(config);
  config = withCallxModifyMainActivity(config, { package: packageName });

  // No AndroidManifest modifications here (service declared in library)

  // Apply iOS setup
  config = withCallxInfoPlist(config);
  config = withCallxCopyAssetsIOS(config);

  return config;
};

// Create run-once plugin to prevent duplicate execution
const pak = require('../../package.json');
export default createRunOncePlugin(withCallx, pak.name, pak.version);
