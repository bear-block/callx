import type { ConfigPlugin } from '@expo/config-plugins';
import { withDangerousMod } from '@expo/config-plugins';
import * as fs from 'fs';
import * as path from 'path';

const CALLX_JSON = 'callx.json';

export const withCallxCopyAssets: ConfigPlugin = (config) => {
  return withDangerousMod(config, [
    'android',
    async (configMod) => {
      const projectRoot = configMod.modRequest.projectRoot;
      const androidProjectRoot = path.join(projectRoot, 'android');
      const assetsDir = path.join(
        androidProjectRoot,
        'app',
        'src',
        'main',
        'assets'
      );

      // Ensure assets directory exists
      if (!fs.existsSync(assetsDir)) {
        fs.mkdirSync(assetsDir, { recursive: true });
      }

      const callxJsonPath = path.join(projectRoot, CALLX_JSON);
      const targetPath = path.join(assetsDir, CALLX_JSON);

      // Check if callx.json exists in project root
      if (!fs.existsSync(callxJsonPath)) {
        console.warn(
          `[callx] ${CALLX_JSON} not found in project root. Skipping copy.`
        );
        return configMod;
      }

      try {
        // Copy callx.json to Android assets
        fs.copyFileSync(callxJsonPath, targetPath);
        console.log(
          `[callx] ✓ Copied ${CALLX_JSON} to Android assets directory`
        );
      } catch (error) {
        console.warn(
          `[callx] Warning: Failed to copy ${CALLX_JSON}:`,
          error instanceof Error ? error.message : error
        );
      }

      return configMod;
    },
  ]);
};
