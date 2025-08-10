import type { ConfigPlugin } from '@expo/config-plugins';
import { withDangerousMod } from '@expo/config-plugins';
import * as fs from 'fs';
import * as path from 'path';

const CALLX_JSON = 'callx.json';

export const withCallxCopyAssets: ConfigPlugin = (config) => {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const iosProjectRoot = path.join(projectRoot, 'ios');

      // Get app name from expo config
      const appName = config.name || 'App';
      const appDir = path.join(iosProjectRoot, appName);

      const callxJsonPath = path.join(projectRoot, CALLX_JSON);

      // Check if callx.json exists in project root
      if (!fs.existsSync(callxJsonPath)) {
        console.warn(
          `[callx] ${CALLX_JSON} not found in project root. Skipping copy.`
        );
        return config;
      }

      // Check if iOS app directory exists
      if (!fs.existsSync(appDir)) {
        console.warn(
          `[callx] iOS app directory not found: ${appDir}. Skipping copy.`
        );
        return config;
      }

      const destPath = path.join(appDir, CALLX_JSON);

      try {
        // Copy callx.json to iOS bundle directory
        fs.copyFileSync(callxJsonPath, destPath);
        console.log(
          `[callx] ✓ Copied ${CALLX_JSON} to iOS bundle: ${appName}/${CALLX_JSON}`
        );
      } catch (error) {
        console.warn(
          `[callx] Warning: Failed to copy ${CALLX_JSON}:`,
          error instanceof Error ? error.message : error
        );
      }

      return config;
    },
  ]);
};
