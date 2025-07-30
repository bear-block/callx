import type { ConfigPlugin } from '@expo/config-plugins';
import { createRunOncePlugin } from '@expo/config-plugins';
import { withCallxCopyAssets } from './android/copyAssets';
import { withCallxModifyMainActivity } from './android/modifyMainActivity';
import { withCallxInfoPlist } from './ios/infoPlist';
import { withCallxCopyAssets as withCallxCopyAssetsIOS } from './ios/copyAssets';

const withCallx: ConfigPlugin = (config) => {
  // Android plugins
  config = withCallxCopyAssets(config);
  config = withCallxModifyMainActivity(config);

  // iOS plugins
  config = withCallxInfoPlist(config);
  config = withCallxCopyAssetsIOS(config);

  return config;
};

// Create run-once plugin to prevent duplicate execution
const pak = require('../../package.json');
export default createRunOncePlugin(withCallx, pak.name, pak.version);
