module.exports = {
  dependencies: {
    callx: {
      platforms: {
        android: {
          sourceDir: './android',
          packageImportPath: 'import com.callx.CallxPackage;',
          packageInstance: 'new CallxPackage()',
          // Auto-add Firebase dependencies
          dependency: {
            implementation: [
              'com.google.firebase:firebase-messaging:23.4.0',
              'com.google.firebase:firebase-analytics:21.5.0',
            ],
          },
          // Auto-add Google Services plugin
          buildGradle: {
            applyPlugin: 'com.google.gms.google-services',
          },
          // Auto-add to project level build.gradle
          projectBuildGradle: {
            classpath: 'com.google.gms:google-services:4.4.0',
          },
          // Auto-copy callx.json to assets
          assets: {
            copy: [
              {
                from: 'callx.json',
                to: 'src/main/assets/callx.json',
              },
            ],
          },
        },
      },
    },
  },
};
