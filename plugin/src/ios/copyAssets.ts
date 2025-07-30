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
      const bundleDir = path.join(iosProjectRoot, 'CallxExample', 'callx.json');

      const callxJsonPath = path.join(projectRoot, CALLX_JSON);

      // Check if callx.json exists in project root
      if (!fs.existsSync(callxJsonPath)) {
        console.warn(
          `[callx] ${CALLX_JSON} not found in project root. Skipping copy.`
        );
        return config;
      }

      try {
        // Copy callx.json to iOS bundle
        fs.copyFileSync(callxJsonPath, bundleDir);
        console.log(`[callx] ✓ Copied ${CALLX_JSON} to iOS bundle directory`);
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
