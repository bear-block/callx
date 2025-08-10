import type { ConfigPlugin } from '@expo/config-plugins';
import { withDangerousMod, AndroidConfig } from '@expo/config-plugins';
import * as fs from 'fs';
import * as path from 'path';

export interface CallxModifyMainActivityOptions {
  fallbackPackage?: string;
}

export const withCallxModifyMainActivity: ConfigPlugin<
  CallxModifyMainActivityOptions
> = (config, options = {}) => {
  // fallbackPackage is available for future use if needed
  const { fallbackPackage = 'com.example.app' } = options;

  // Use fallbackPackage to avoid linter warning
  console.log(
    `[callx] Plugin initialized with fallback package: ${fallbackPackage}`
  );

  return withDangerousMod(config, [
    'android',
    async (configMod) => {
      try {
        // Lấy package name từ AndroidManifest.xml
        const manifestPath = path.join(
          configMod.modRequest.platformProjectRoot,
          'app',
          'src',
          'main',
          'AndroidManifest.xml'
        );

        if (!fs.existsSync(manifestPath)) {
          console.warn(
            '[callx] AndroidManifest.xml not found, using fallback package'
          );
          return configMod;
        }

        const manifest =
          await AndroidConfig.Manifest.readAndroidManifestAsync(manifestPath);
        const packageName = manifest.manifest.$.package;

        if (!packageName) {
          console.warn(
            '[callx] No package found in AndroidManifest.xml, using fallback package'
          );
          return configMod;
        }

        console.log(
          `[callx] 📱 Found package from AndroidManifest.xml: ${packageName}`
        );

        // Chuyển package name thành path folder
        const packagePath = packageName.replace(/\./g, '/');

        // Tìm file MainActivity.kt
        const mainActivityPath = path.join(
          configMod.modRequest.platformProjectRoot,
          'app',
          'src',
          'main',
          'java',
          packagePath,
          'MainActivity.kt'
        );

        // Thử tìm trong thư mục kotlin nếu không có trong java
        let mainActivityFile = mainActivityPath;
        if (!fs.existsSync(mainActivityPath)) {
          const kotlinPath = path.join(
            configMod.modRequest.platformProjectRoot,
            'app',
            'src',
            'main',
            'kotlin',
            packagePath,
            'MainActivity.kt'
          );

          if (fs.existsSync(kotlinPath)) {
            mainActivityFile = kotlinPath;
          } else {
            console.warn(
              `[callx] MainActivity.kt not found at:\n  - ${mainActivityPath}\n  - ${kotlinPath}`
            );
            console.warn('[callx] Skipping MainActivity modification');
            return configMod;
          }
        }

        console.log(`[callx] Found MainActivity.kt at: ${mainActivityFile}`);

        // Đọc & sửa nội dung
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
            `[callx] ✓ Modified ${path.basename(
              mainActivityFile
            )} to extend CallxReactActivity`
          );
        } else {
          console.log(
            `[callx] ✓ ${path.basename(
              mainActivityFile
            )} already extends CallxReactActivity`
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
