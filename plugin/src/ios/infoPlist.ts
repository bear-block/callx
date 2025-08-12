import type { ConfigPlugin } from '@expo/config-plugins';
import { withInfoPlist } from '@expo/config-plugins';

export const withCallxInfoPlist: ConfigPlugin<{
  triggers?: Record<string, { field: string; value: string }>;
  fields?: Record<string, { field: string; fallback?: string }>;
  app?: { supportsVideo?: boolean; enabledLogPhoneCall?: boolean };
}> = (config, options?: any) => {
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

    // Inject Callx mapping into Info.plist so native can read without assets
    if (options?.triggers) {
      const triggers: any = {};
      Object.entries(options.triggers).forEach(([key, cfg]: any) => {
        triggers[key] = { field: cfg.field, value: cfg.value };
      });
      (config.modResults as any).CallxTriggers = triggers;
    }

    if (options?.fields) {
      const fields: any = {};
      Object.entries(options.fields).forEach(([key, cfg]: any) => {
        fields[key] = { field: cfg.field };
        if (cfg.fallback != null) fields[key].fallback = cfg.fallback;
      });
      (config.modResults as any).CallxFields = fields;
    }

    if (options?.app) {
      const appCfg: any = {};
      if (typeof options.app.supportsVideo === 'boolean') {
        appCfg.supportsVideo = options.app.supportsVideo;
      }
      if (typeof options.app.enabledLogPhoneCall === 'boolean') {
        appCfg.enabledLogPhoneCall = options.app.enabledLogPhoneCall;
      }
      if (Object.keys(appCfg).length) {
        (config.modResults as any).CallxApp = appCfg;
      }
    }

    return config;
  });
};
