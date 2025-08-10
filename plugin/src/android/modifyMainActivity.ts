import type { ConfigPlugin } from '@expo/config-plugins';
import { withDangerousMod } from '@expo/config-plugins';
import * as fs from 'fs';
import * as path from 'path';

export interface CallxModifyMainActivityOptions {
  package: string;
}

export const withCallxModifyMainActivity: ConfigPlugin<
  CallxModifyMainActivityOptions
> = (config, options) => {
  if (!options?.package) {
    throw new Error(
      '[callx] Package option is required for modifyMainActivity'
    );
  }

  const { package: packageName } = options;

  console.log(`[callx] Plugin initialized with package: ${packageName}`);

  return withDangerousMod(config, [
    'android',
    async (configMod) => {
      try {
        // Sử dụng package name từ options
        console.log(`[callx] 📱 Using package from options: ${packageName}`);

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

        // Check if class already extends CallxReactActivity
        if (!content.includes(': CallxReactActivity')) {
          // Try different patterns for Kotlin class declaration
          let classModified = false;

          // Pattern 1: class MainActivity : ReactActivity() {
          if (content.includes('class MainActivity : ReactActivity()')) {
            content = content.replace(
              /class\s+MainActivity\s*:\s*ReactActivity\(\)\s*\{/,
              'class MainActivity : CallxReactActivity() {'
            );
            classModified = true;
          }
          // Pattern 2: class MainActivity : ReactActivity {
          else if (content.includes('class MainActivity : ReactActivity')) {
            content = content.replace(
              /class\s+MainActivity\s*:\s*ReactActivity\s*\{/,
              'class MainActivity : CallxReactActivity() {'
            );
            classModified = true;
          }
          // Pattern 3: class MainActivity extends ReactActivity {
          else if (
            content.includes('class MainActivity extends ReactActivity')
          ) {
            content = content.replace(
              /class\s+MainActivity\s+extends\s+ReactActivity\s*\{/,
              'class MainActivity : CallxReactActivity() {'
            );
            classModified = true;
          }

          if (classModified) {
            modified = true;
          }
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
