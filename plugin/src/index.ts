import { withPlugins, createRunOncePlugin } from '@expo/config-plugins';
import type { ConfigPlugin } from '@expo/config-plugins';
import { withCallxAndroidManifest } from './android/manifest';
import { withCallxCopyAssets } from './android/copyAssets';
import { withCallxModifyMainActivity } from './android/modifyMainActivity';

interface CallxPluginConfig {
  mode?: 'native' | 'js';
}

/**
 * A config plugin for configuring Callx - React Native incoming call UI library
 */
const withCallx: ConfigPlugin<CallxPluginConfig> = (config, props = {}) => {
  const { mode = 'native' } = props;

  const plugins = [
    // Always required
    withCallxCopyAssets,
    withCallxModifyMainActivity,
  ];

  // Only add manifest service for native mode
  if (mode === 'native') {
    plugins.push(withCallxAndroidManifest);
  }

  return withPlugins(config, plugins);
};
const pak = require('@bear-block/callx/package.json');
export default createRunOncePlugin(withCallx, pak.name, pak.version);
