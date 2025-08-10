import type { ConfigPlugin } from '@expo/config-plugins';
import { withDangerousMod } from '@expo/config-plugins';
import * as fs from 'fs';
import * as path from 'path';

export const withCallxModifyMainActivity: ConfigPlugin = (config) => {
  return withDangerousMod(config, [
    'android',
    async (configMod) => {
      const projectRoot = configMod.modRequest.projectRoot;
      const androidProjectRoot = path.join(projectRoot, 'android');

      if (!fs.existsSync(androidProjectRoot)) {
        console.log(
          '[callx] Android directory not found, skipping MainActivity modification'
        );
        return configMod;
      }

      // Get package name from app.json or expo config
      const packageName =
        (configMod.modResults as any)?.android?.package || 'com.example.app';
      const packagePath = packageName.replace(/\./g, '/');

      console.log(
        `[callx] Looking for MainActivity in package: ${packageName}`
      );

      // Try multiple possible MainActivity.kt locations
      const possiblePaths = [
        // Standard Expo structure
        path.join(
          androidProjectRoot,
          'app',
          'src',
          'main',
          'java',
          packagePath,
          'MainActivity.kt'
        ),
        // Alternative structure
        path.join(
          androidProjectRoot,
          'app',
          'src',
          'main',
          'kotlin',
          packagePath,
          'MainActivity.kt'
        ),
        // Legacy structure
        path.join(
          androidProjectRoot,
          'app',
          'src',
          'main',
          'java',
          packagePath,
          'MainActivity.java'
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
          `[callx] MainActivity not found in any of these locations:\n${possiblePaths.map((p) => `  - ${p}`).join('\n')}`
        );
        console.warn('[callx] Skipping MainActivity modification');
        return configMod;
      }

      console.log(`[callx] Found MainActivity at: ${mainActivityFile}`);

      try {
        let content = fs.readFileSync(mainActivityFile, 'utf8');
        let modified = false;

        // Determine if this is Kotlin or Java
        const isKotlin = mainActivityFile.endsWith('.kt');
        const isJava = mainActivityFile.endsWith('.java');

        // Always modify MainActivity to extend CallxReactActivity (regardless of mode)
        if (isKotlin) {
          // Kotlin MainActivity
          if (!content.includes('import com.callx.CallxReactActivity')) {
            content = content.replace(
              /(import com\.facebook\.react\.ReactActivity)/,
              '$1\nimport com.callx.CallxReactActivity'
            );
            modified = true;
          }

          if (!content.includes(': CallxReactActivity')) {
            content = content.replace(
              /class\s+MainActivity\s*:\s*ReactActivity\(\)/,
              'class MainActivity : CallxReactActivity()'
            );
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
        } else if (isJava) {
          // Java MainActivity
          if (!content.includes('import com.callx.CallxReactActivity')) {
            content = content.replace(
              /(import com\.facebook\.react\.ReactActivity;)/,
              '$1\nimport com.callx.CallxReactActivity;'
            );
            modified = true;
          }

          if (!content.includes('extends CallxReactActivity')) {
            content = content.replace(
              /class\s+MainActivity\s+extends\s+ReactActivity/,
              'class MainActivity extends CallxReactActivity'
            );
            modified = true;
          }

          // Add comment if not already present
          const comment =
            '// Extends CallxReactActivity for automatic lockscreen handling';
          if (
            !content.includes(comment) &&
            content.includes('extends CallxReactActivity')
          ) {
            content = content.replace(
              /(class\s+MainActivity\s+extends\s+CallxReactActivity)/,
              `${comment}\npublic $1`
            );
            modified = true;
          }
        }

        if (modified) {
          fs.writeFileSync(mainActivityFile, content);
          console.log(
            `[callx] ✓ Modified ${path.basename(mainActivityFile)} to extend CallxReactActivity (ALWAYS required)`
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
    },
  ]);
};
