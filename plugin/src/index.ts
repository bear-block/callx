import { withPlugins, createRunOncePlugin } from '@expo/config-plugins';
import type { ConfigPlugin } from '@expo/config-plugins';
import { withCallxAndroidManifest } from './android/manifest';
import { withCallxCopyAssets } from './android/copyAssets';
import { withCallxModifyMainActivity } from './android/modifyMainActivity';

type CallxPluginProps = { mode?: 'native' | 'js' };

const withCallx: ConfigPlugin<CallxPluginProps> = (config, props = {}) => {
  const { mode = 'native' } = props;
  const plugins = [withCallxCopyAssets, withCallxModifyMainActivity];
  if (mode === 'native') {
    plugins.push(withCallxAndroidManifest);
  }
  return withPlugins(config, plugins);
};

const pak = require('../../package.json');
export default createRunOncePlugin(withCallx, pak.name, pak.version);
