import { AppRegistry } from 'react-native';
import App from './src/App';
import { name as appName } from './app.json';
import CallxInstance from 'callx';
import messaging from '@react-native-firebase/messaging';

// 🚨 CRITICAL: Background FCM handler - MUST be in index.js!
messaging().setBackgroundMessageHandler(async (remoteMessage) => {
  console.log('📱 [index.js] FCM Background message received:', remoteMessage);

  try {
    const messageData = remoteMessage.data || {};
    console.log('📊 [index.js] Background data:', messageData);

    // Initialize CallxInstance if needed (for first-time killed app)
    // Config is now baked into native code from callx.json at build time
    try {
      await CallxInstance.initialize({});
      console.log('✅ [index.js] CallxInstance initialized for background');
    } catch (error) {
      console.error(
        '❌ [index.js] CallxInstance initialization failed:',
        error
      );
      console.log('ℹ️ [index.js] CallxInstance already initialized');
    }

    // Process background FCM message
    if (messageData.type === 'call.started') {
      console.log('🎯 [index.js] Processing background incoming call...');
      await CallxInstance.handleFcmMessage(messageData);
    } else if (messageData.type === 'call.ended') {
      console.log('🎯 [index.js] Processing background call ended...');
      await CallxInstance.handleFcmMessage(messageData);
    } else if (messageData.callId && messageData.callerName) {
      // Fallback: process any message with call data
      console.log('🔧 [index.js] Processing fallback background call...');
      await CallxInstance.handleFcmMessage({
        type: 'call.started',
        ...messageData,
      });
    } else {
      console.log('⚠️ [index.js] Background message not recognized as call');
    }
  } catch (error) {
    console.error('❌ [index.js] Background message processing failed:', error);
  }
});

console.log('🚀 [index.js] Background FCM handler registered');

AppRegistry.registerComponent(appName, () => App);
