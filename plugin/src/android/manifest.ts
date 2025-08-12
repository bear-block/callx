import { withAndroidManifest } from '@expo/config-plugins';
import type { ConfigPlugin } from '@expo/config-plugins';

const FCM_SERVICE = {
  'android:name': 'com.callx.CallxFirebaseMessagingService',
  'android:directBootAware': 'true',
  'android:exported': 'false',
};

export const withCallxAndroidManifest: ConfigPlugin<{
  triggers?: Record<string, { field: string; value: string }>;
  fields?: Record<string, { field: string; fallback?: string }>;
  app?: { supportsVideo?: boolean; enabledLogPhoneCall?: boolean };
}> = (config: any, options?: any) => {
  return withAndroidManifest(config, (modConfig: any) => {
    const app = modConfig.modResults.manifest.application?.[0];
    if (!app) {
      return modConfig;
    }

    // Check if service already exists
    const exists = (app.service || []).some(
      (s: any) => s.$ && s.$['android:name'] === FCM_SERVICE['android:name']
    );

    if (!exists) {
      app.service = app.service || [];
      app.service.push({
        '$': FCM_SERVICE as any,
        'intent-filter': [
          {
            $: { 'android:priority': '1' } as any,
            action: [
              { $: { 'android:name': 'com.google.firebase.MESSAGING_EVENT' } },
            ],
          },
        ],
      });
      // No logs
    } else {
      // No logs
    }

    // Inject Callx mapping as <meta-data> (shorthand only)
    if (options?.triggers || options?.fields || options?.app) {
      const meta: any[] = app['meta-data'] || [];

      const upsertMeta = (name: string, value: string) => {
        const existsIdx = meta.findIndex(
          (m: any) => m.$ && m.$['android:name'] === name
        );
        const entry = { $: { 'android:name': name, 'android:value': value } };
        if (existsIdx >= 0) meta[existsIdx] = entry;
        else meta.push(entry);
      };

      // Triggers (shorthand): name => "<field>:<value>"
      if (options?.triggers) {
        Object.entries(options.triggers).forEach(([key, cfg]: any) => {
          upsertMeta(key, `${cfg.field}:${cfg.value}`);
        });
      }

      // Fields (shorthand): name => "<path>[:<fallback>]"
      if (options?.fields) {
        Object.entries(options.fields).forEach(([key, cfg]: any) => {
          const value =
            cfg.fallback != null
              ? `${cfg.field}:${String(cfg.fallback)}`
              : cfg.field;
          upsertMeta(key, value);
        });
      }

      // App flags
      if (options?.app) {
        if (typeof options.app.supportsVideo === 'boolean') {
          upsertMeta('supportsVideo', String(options.app.supportsVideo));
        }
        if (typeof options.app.enabledLogPhoneCall === 'boolean') {
          upsertMeta(
            'enabledLogPhoneCall',
            String(options.app.enabledLogPhoneCall)
          );
        }
      }

      app['meta-data'] = meta;
    }

    return modConfig;
  });
};
