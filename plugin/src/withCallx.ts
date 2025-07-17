import {
  type ConfigPlugin,
  createRunOncePlugin,
  withPlugins,
} from '@expo/config-plugins';
import { withCallxAndroidManifest } from './android/manifest';
import { withCallxCopyAssets } from './android/copyAssets';
import { withCallxModifyMainActivity } from './android/modifyMainActivity';

const pkg = require('../../package.json');

type Props = {
  mode?: 'native' | 'js';
};

export const withCallxAndroid: ConfigPlugin<Props | void> = (
  config,
  { mode = 'native' } = {}
) => {
  const plugins = [withCallxCopyAssets, withCallxModifyMainActivity];

  if (mode === 'native') {
    plugins.push(withCallxAndroidManifest);
  }

  return withPlugins(config, plugins);
};

const withCallx: ConfigPlugin<Props | void> = (config, props = {}) => {
  // Apply Android modifications
  config = withCallxAndroid(config, props);

  return config;
};

export default createRunOncePlugin(withCallx, pkg.name, pkg.version);
