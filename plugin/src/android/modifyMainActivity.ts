import { withDangerousMod } from '@expo/config-plugins';
import type { ConfigPlugin } from '@expo/config-plugins';
import * as fs from 'fs';
import * as path from 'path';

function modifyMainActivity(projectRoot: string) {
  if (!projectRoot) {
    throw new Error(
      '[callx] projectRoot is undefined. Cannot modify MainActivity.'
    );
  }

  const mainActivityPath = path.join(projectRoot, 'android/app/src/main/java');

  // Check if android directory exists
  if (!fs.existsSync(path.join(projectRoot, 'android'))) {
    console.log(
      '[callx] Android directory not found, skipping MainActivity modification'
    );
    return;
  }

  // Find MainActivity.kt file
  let mainActivityFile: string | null = null;
  const findMainActivity = (dir: string) => {
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
          findMainActivity(fullPath);
        } else if (file === 'MainActivity.kt') {
          mainActivityFile = fullPath;
          return;
        }
      }
    }
  };

  findMainActivity(mainActivityPath);

  if (!mainActivityFile) {
    console.log('[callx] MainActivity.kt not found, skipping modification');
    return;
  }

  let content = fs.readFileSync(mainActivityFile, 'utf8');

  // Check if already extends CallxReactActivity
  if (content.includes('CallxReactActivity')) {
    console.log('[callx] MainActivity already extends CallxReactActivity. ✓');
    return;
  }

  // Add import
  if (!content.includes('import com.callx.CallxReactActivity')) {
    content = content.replace(
      /import com\.facebook\.react\.ReactActivity/,
      'import com.facebook.react.ReactActivity\nimport com.callx.CallxReactActivity'
    );
  }

  // Change inheritance from ReactActivity to CallxReactActivity
  content = content.replace(
    /class\s+MainActivity\s*:\s*ReactActivity/,
    'class MainActivity : CallxReactActivity'
  );

  // Add explanatory comment
  const comment = `
/**
 * MainActivity - REQUIRED: Extends CallxReactActivity for automatic lockscreen handling
 * This is required for Callx to work properly with lockscreen notifications.
 */`;

  if (
    !content.includes(
      'Extends CallxReactActivity for automatic lockscreen handling'
    )
  ) {
    content = content.replace(
      /class\s+MainActivity\s*:\s*CallxReactActivity/,
      `${comment}\nclass MainActivity : CallxReactActivity`
    );
  }

  fs.writeFileSync(mainActivityFile, content);
  console.log(
    `[callx] ✓ Modified ${mainActivityFile} to extend CallxReactActivity (REQUIRED)`
  );
}

export const withCallxModifyMainActivity: ConfigPlugin = (config: any) => {
  return withDangerousMod(config, [
    'android',
    async (modConfig: any) => {
      try {
        const projectRoot = modConfig.projectRoot || process.cwd();
        modifyMainActivity(projectRoot);
      } catch (error: any) {
        console.warn(
          '[callx] Warning: Failed to modify MainActivity:',
          error.message
        );
      }
      return modConfig;
    },
  ]);
};
