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

        console.log(
          `[callx] 🔍 Looking for AndroidManifest.xml at: ${manifestPath}`
        );

        if (!fs.existsSync(manifestPath)) {
          console.warn(
            '[callx] AndroidManifest.xml not found, using fallback package'
          );
          return configMod;
        }

        console.log(`[callx] 📄 Found AndroidManifest.xml, reading package...`);

        let packageName: string | null = null;

        try {
          const manifest =
            await AndroidConfig.Manifest.readAndroidManifestAsync(manifestPath);

          console.log(
            `[callx] 📋 Manifest content:`,
            JSON.stringify(manifest, null, 2)
          );

          packageName = manifest.manifest?.$?.package || null;

          if (packageName) {
            console.log(
              `[callx] 📱 Found package from AndroidManifest.xml: ${packageName}`
            );
          } else {
            console.warn(
              '[callx] No package found in AndroidManifest.xml, using fallback package'
            );
            packageName = fallbackPackage;
          }
        } catch (manifestError) {
          console.warn(
            '[callx] Error reading AndroidManifest.xml:',
            manifestError instanceof Error
              ? manifestError.message
              : manifestError
          );
          console.warn('[callx] Using fallback package');
          packageName = fallbackPackage;
        }

        // Chuyển package name thành path folder
        const packagePath = packageName.replace(/\./g, '/');

        // Tìm file MainActivity.kt - thử nhiều vị trí
        const possiblePaths = [
          // Standard paths
          path.join(
            configMod.modRequest.platformProjectRoot,
            'app',
            'src',
            'main',
            'java',
            packagePath,
            'MainActivity.kt'
          ),
          path.join(
            configMod.modRequest.platformProjectRoot,
            'app',
            'src',
            'main',
            'kotlin',
            packagePath,
            'MainActivity.kt'
          ),
          // Alternative paths (some projects use different structure)
          path.join(
            configMod.modRequest.platformProjectRoot,
            'app',
            'src',
            'main',
            'java',
            packagePath,
            'MainActivity.java'
          ),
          path.join(
            configMod.modRequest.platformProjectRoot,
            'app',
            'src',
            'main',
            'kotlin',
            packagePath,
            'MainActivity.java'
          ),
          // Root level search
          path.join(
            configMod.modRequest.platformProjectRoot,
            'app',
            'src',
            'main',
            'MainActivity.kt'
          ),
          path.join(
            configMod.modRequest.platformProjectRoot,
            'app',
            'src',
            'main',
            'MainActivity.java'
          ),
        ];

        console.log(
          `[callx] 🔍 Searching for MainActivity in package: ${packageName}`
        );
        console.log(`[callx] 📁 Package path: ${packagePath}`);

        let mainActivityFile: string | null = null;
        for (const possiblePath of possiblePaths) {
          if (fs.existsSync(possiblePath)) {
            mainActivityFile = possiblePath;
            console.log(`[callx] ✅ Found MainActivity at: ${possiblePath}`);
            break;
          }
        }

        if (!mainActivityFile) {
          console.warn(
            `[callx] MainActivity not found in any of these locations:`
          );
          possiblePaths.forEach((p, i) => {
            console.warn(`  ${i + 1}. ${p}`);
          });
          console.warn('[callx] Skipping MainActivity modification');
          return configMod;
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
