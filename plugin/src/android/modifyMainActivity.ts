import type { ConfigPlugin } from '@expo/config-plugins';
import { withDangerousMod } from '@expo/config-plugins';
import * as fs from 'fs';
import * as path from 'path';

export const withCallxModifyMainActivity: ConfigPlugin = (config) => {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const androidProjectRoot = path.join(projectRoot, 'android');

      if (!fs.existsSync(androidProjectRoot)) {
        console.log(
          '[callx] Android directory not found, skipping MainActivity modification'
        );
        return config;
      }

      // Find MainActivity.kt file
      const mainActivityFile = path.join(
        androidProjectRoot,
        'app',
        'src',
        'main',
        'java',
        'com',
        'callx',
        'example',
        'MainActivity.kt'
      );

      if (!fs.existsSync(mainActivityFile)) {
        console.warn(
          '[callx] MainActivity.kt not found, skipping modification'
        );
        return config;
      }

      try {
        let content = fs.readFileSync(mainActivityFile, 'utf8');

        // Add import for CallxReactActivity
        if (!content.includes('import com.callx.CallxReactActivity')) {
          content = content.replace(
            /import com\.facebook\.react\.ReactActivity/,
            'import com.facebook.react.ReactActivity\nimport com.callx.CallxReactActivity'
          );
        }

        // Extend CallxReactActivity instead of ReactActivity
        if (!content.includes('extends CallxReactActivity')) {
          content = content.replace(
            /class\s+MainActivity\s*:\s*ReactActivity/,
            'class MainActivity : CallxReactActivity'
          );
        }

        // Add comment if not already present
        const comment =
          '// Extends CallxReactActivity for automatic lockscreen handling';
        if (!content.includes(comment)) {
          content = content.replace(
            /class\s+MainActivity\s*:\s*CallxReactActivity/,
            `${comment}\nclass MainActivity : CallxReactActivity`
          );
        }

        fs.writeFileSync(mainActivityFile, content);
        console.log(
          `[callx] ✓ Modified ${path.basename(mainActivityFile)} to extend CallxReactActivity (REQUIRED)`
        );
      } catch (error) {
        console.warn(
          '[callx] Warning: Failed to modify MainActivity:',
          error instanceof Error ? error.message : error
        );
      }

      return config;
    },
  ]);
};
