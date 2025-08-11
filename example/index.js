import { AppRegistry } from 'react-native';
import App from './src/App';
import { name as appName } from './app.json';
import messaging from '@react-native-firebase/messaging';

// 🚨 Background FCM handler - Now handled by native service!
messaging().setBackgroundMessageHandler(async (remoteMessage) => {
  console.log(
    '📱 [index.js] FCM Background message (delegated to native):',
    remoteMessage
  );

  // Native CallxFirebaseMessagingService handles the actual processing
  // This is just for any JS-specific requirements
  console.log('✅ [index.js] Message processing delegated to native service');
});

console.log('🚀 [index.js] Background FCM handler registered (native-first)');

AppRegistry.registerComponent(appName, () => App);
