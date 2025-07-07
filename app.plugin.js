const {
  withProjectBuildGradle,
  withAppBuildGradle,
} = require('@expo/config-plugins');

/**
 * Expo plugin for Callx library
 * Automatically adds Google Services plugin for Firebase
 */
function withCallx(config) {
  // Add Google Services classpath to project level build.gradle
  config = withProjectBuildGradle(config, (projectConfig) => {
    if (
      !projectConfig.modResults.contents.includes(
        'com.google.gms:google-services'
      )
    ) {
      // Find the buildscript dependencies section
      const buildscriptIndex =
        projectConfig.modResults.contents.indexOf('buildscript {');
      if (buildscriptIndex !== -1) {
        const dependenciesIndex = projectConfig.modResults.contents.indexOf(
          'dependencies {',
          buildscriptIndex
        );
        if (dependenciesIndex !== -1) {
          const insertIndex = projectConfig.modResults.contents.indexOf(
            '}',
            dependenciesIndex
          );
          if (insertIndex !== -1) {
            const before = projectConfig.modResults.contents.substring(
              0,
              insertIndex
            );
            const after =
              projectConfig.modResults.contents.substring(insertIndex);
            projectConfig.modResults.contents =
              before +
              "        classpath 'com.google.gms:google-services:4.4.0'\n" +
              after;
          }
        }
      }
    }
    return projectConfig;
  });

  // Add Google Services plugin to app level build.gradle
  config = withAppBuildGradle(config, (appConfig) => {
    if (
      !appConfig.modResults.contents.includes('com.google.gms.google-services')
    ) {
      // Find the apply plugin section
      const applyPluginIndex =
        appConfig.modResults.contents.lastIndexOf('apply plugin:');
      if (applyPluginIndex !== -1) {
        const lineEndIndex = appConfig.modResults.contents.indexOf(
          '\n',
          applyPluginIndex
        );
        if (lineEndIndex !== -1) {
          const before = appConfig.modResults.contents.substring(
            0,
            lineEndIndex + 1
          );
          const after = appConfig.modResults.contents.substring(
            lineEndIndex + 1
          );
          appConfig.modResults.contents =
            before + "apply plugin: 'com.google.gms.google-services'\n" + after;
        }
      }
    }
    return appConfig;
  });

  return config;
}

module.exports = withCallx;
