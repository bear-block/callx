import { withAndroidManifest } from '@expo/config-plugins';
import type { ConfigPlugin } from '@expo/config-plugins';

const FCM_SERVICE = {
  'android:name': 'com.callx.CallxFirebaseMessagingService',
  'android:directBootAware': 'true',
  'android:exported': 'false',
};

export const withCallxAndroidManifest: ConfigPlugin = (config: any) => {
  return withAndroidManifest(config, (modConfig: any) => {
    const app = modConfig.modResults.manifest.application?.[0];
    if (!app) {
      console.warn('[callx] No application tag found in AndroidManifest.xml');
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
      console.log(
        `[callx] ✓ Added CallxFirebaseMessagingService to AndroidManifest.xml (native mode)`
      );
    } else {
      console.log(
        `[callx] ✓ CallxFirebaseMessagingService already exists in AndroidManifest.xml`
      );
    }

    return modConfig;
  });
};
