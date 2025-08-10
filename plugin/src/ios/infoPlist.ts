import type { ConfigPlugin } from '@expo/config-plugins';
import { withInfoPlist } from '@expo/config-plugins';

export const withCallxInfoPlist: ConfigPlugin = (config) => {
  return withInfoPlist(config, (config) => {
    // Add background modes for VoIP and push notifications
    if (!config.modResults.UIBackgroundModes) {
      config.modResults.UIBackgroundModes = [];
    }

    const backgroundModes = config.modResults.UIBackgroundModes as string[];

    if (!backgroundModes.includes('voip')) {
      backgroundModes.push('voip');
    }
    if (!backgroundModes.includes('remote-notification')) {
      backgroundModes.push('remote-notification');
    }
    if (!backgroundModes.includes('background-fetch')) {
      backgroundModes.push('background-fetch');
    }

    // Add privacy descriptions
    config.modResults.NSMicrophoneUsageDescription =
      'This app needs microphone access for voice calls';
    config.modResults.NSCameraUsageDescription =
      'This app needs camera access for video calls';

    return config;
  });
};
