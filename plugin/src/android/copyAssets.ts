import { withDangerousMod } from '@expo/config-plugins';
import type { ConfigPlugin } from '@expo/config-plugins';
import * as fs from 'fs';
import * as path from 'path';

const CALLX_JSON = 'callx.json';
const ANDROID_ASSETS_PATH = 'android/app/src/main/assets';

function ensureDirSync(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function copyCallxJson(projectRoot: string) {
  if (!projectRoot) {
    console.warn('[callx] projectRoot is undefined, skipping callx.json copy');
    return;
  }

  const src = path.join(projectRoot, CALLX_JSON);
  const destDir = path.join(projectRoot, ANDROID_ASSETS_PATH);
  const dest = path.join(destDir, CALLX_JSON);

  if (fs.existsSync(src)) {
    ensureDirSync(destDir);
    fs.copyFileSync(src, dest);
    console.log(`[callx] Copied ${CALLX_JSON} to ${dest}`);
  } else {
    console.warn(
      `[callx] ${CALLX_JSON} not found in project root. Skipping copy.`
    );
  }
}

export const withCallxCopyAssets: ConfigPlugin = (config) => {
  return withDangerousMod(config, [
    'android',
    async (modConfig: any) => {
      try {
        const projectRoot = modConfig.projectRoot || process.cwd();
        copyCallxJson(projectRoot);
      } catch (error: any) {
        console.warn(
          '[callx] Warning: Failed to copy callx.json:',
          error.message
        );
      }
      return modConfig;
    },
  ]);
};
