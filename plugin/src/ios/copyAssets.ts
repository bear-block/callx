import type { ConfigPlugin } from '@expo/config-plugins';
import { withDangerousMod } from '@expo/config-plugins';
import * as fs from 'fs';
import * as path from 'path';

const CALLX_JSON = 'callx.json';

export const withCallxCopyAssets: ConfigPlugin = (config) => {
  return withDangerousMod(config, [
    'ios',
    async (mod) => {
      const projectRoot = mod.modRequest.projectRoot;
      const iosProjectRoot = path.join(projectRoot, 'ios');

      // Get app name from expo config
      const appName = mod.name || 'App';
      const appDir = path.join(iosProjectRoot, appName);

      const callxJsonPath = path.join(projectRoot, CALLX_JSON);

      // Quietly skip if callx.json doesn't exist
      if (!fs.existsSync(callxJsonPath)) {
        return mod;
      }

      // Quietly skip if iOS app directory doesn't exist
      if (!fs.existsSync(appDir)) {
        return mod;
      }

      const destPath = path.join(appDir, CALLX_JSON);

      try {
        // Copy callx.json to iOS bundle directory (no logs requested)
        fs.copyFileSync(callxJsonPath, destPath);
      } catch (error) {
        // Silent on failure
      }

      return mod;
    },
  ]);
};
