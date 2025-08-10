import type { ConfigPlugin } from '@expo/config-plugins';
import { withAndroidManifest } from '@expo/config-plugins';
import * as fs from 'fs';
import * as path from 'path';

export interface CallxModifyMainActivityOptions {
  fallbackPackage?: string;
}

export const withCallxModifyMainActivity: ConfigPlugin<
  CallxModifyMainActivityOptions
> = (config, options = {}) => {
  const { fallbackPackage = 'com.example.app' } = options;

  return withAndroidManifest(config, (configMod) => {
    const projectRoot = configMod.modRequest.projectRoot;
    const androidProjectRoot = path.join(projectRoot, 'android');

    if (!fs.existsSync(androidProjectRoot)) {
      console.log(
        '[callx] Android directory not found, skipping MainActivity modification'
      );
      return configMod;
    }

    // Get package name from AndroidManifest.xml
    const packageName =
      configMod.modResults.manifest.$?.package || fallbackPackage;

    if (packageName && packageName !== fallbackPackage) {
      console.log(
        `[callx] 🎯 Found package from AndroidManifest.xml: ${packageName}`
      );
    } else {
      console.log(`[callx] ⚠️  Using fallback package name: ${packageName}`);
    }

    const packagePath = packageName.replace(/\./g, '/');

    console.log(`[callx] Looking for MainActivity in package: ${packageName}`);

    // Look for MainActivity.kt in the expected package path
    const possiblePaths = [
      path.join(
        androidProjectRoot,
        'app',
        'src',
        'main',
        'java',
        packagePath,
        'MainActivity.kt'
      ),
      path.join(
        androidProjectRoot,
        'app',
        'src',
        'main',
        'kotlin',
        packagePath,
        'MainActivity.kt'
      ),
    ];

    let mainActivityFile: string | null = null;
    for (const filePath of possiblePaths) {
      if (fs.existsSync(filePath)) {
        mainActivityFile = filePath;
        break;
      }
    }

    if (!mainActivityFile) {
      console.warn(
        `[callx] MainActivity.kt not found in any of these locations:\n${possiblePaths.map((p) => `  - ${p}`).join('\n')}`
      );
      console.warn('[callx] Skipping MainActivity modification');
      return configMod;
    }

    console.log(`[callx] Found MainActivity.kt at: ${mainActivityFile}`);

    try {
      let content = fs.readFileSync(mainActivityFile, 'utf8');
      let modified = false;

      // Always modify MainActivity to extend CallxReactActivity
      if (!content.includes('import com.callx.CallxReactActivity')) {
        content = content.replace(
          /(import com\.facebook\.react\.ReactActivity)/,
          '$1\nimport com.callx.CallxReactActivity'
        );
        modified = true;
      }

      if (!content.includes(': CallxReactActivity')) {
        content = content.replace(
          /class\s+MainActivity\s*:\s*ReactActivity\s*\{/,
          'class MainActivity : CallxReactActivity() {'
        );
        modified = true;
      }

      // Add comment if not already present
      const comment =
        '// Extends CallxReactActivity for automatic lockscreen handling';
      if (
        !content.includes(comment) &&
        content.includes(': CallxReactActivity')
      ) {
        content = content.replace(
          /(class\s+MainActivity\s*:\s*CallxReactActivity)/,
          `${comment}\n$1`
        );
        modified = true;
      }

      if (modified) {
        fs.writeFileSync(mainActivityFile, content);
        console.log(
          `[callx] ✓ Modified ${path.basename(mainActivityFile)} to extend CallxReactActivity`
        );
      } else {
        console.log(
          `[callx] ✓ ${path.basename(mainActivityFile)} already extends CallxReactActivity`
        );
      }
    } catch (error) {
      console.warn(
        '[callx] Warning: Failed to modify MainActivity:',
        error instanceof Error ? error.message : error
      );
    }

    return configMod;
  });
};
