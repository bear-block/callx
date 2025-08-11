import type { ConfigPlugin } from '@expo/config-plugins';
import { createRunOncePlugin } from '@expo/config-plugins';
import { withCallxModifyMainActivity } from './android/modifyMainActivity';
import { withCallxInfoPlist } from './ios/infoPlist';
import { withCallxAndroidManifest } from './android/manifest';

export interface CallxPluginOptions {
  package: string;
  triggers?: Record<string, { field: string; value: string }>;
  fields?: Record<string, { field: string; fallback?: string }>;
}

const withCallx: ConfigPlugin<CallxPluginOptions> = (config, options) => {
  if (!options?.package) {
    throw new Error(
      '[callx] Package option is required. Please provide the Android package name.'
    );
  }

  const { package: packageName } = options;
  // Intentionally no general logs: keep output minimal

  // Android plugins - modify MainActivity and inject mapping/meta-data
  config = withCallxModifyMainActivity(config, { package: packageName });
  config = withCallxAndroidManifest(config, {
    triggers: options?.triggers,
    fields: options?.fields,
  });

  // Apply iOS setup + inject mapping (no asset copy)
  config = withCallxInfoPlist(config, {
    triggers: options?.triggers,
    fields: options?.fields,
  });

  return config;
};

// Create run-once plugin to prevent duplicate execution
const pak = require('../../package.json');
export default createRunOncePlugin(withCallx, pak.name, pak.version);
