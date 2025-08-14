import { AppRegistry } from 'react-native';
import App from './src/App';
import { name as appName } from './app.json';
import CallxInstance from '@bear-block/callx';

// Config is now provided via AndroidManifest (Android) and Info.plist (iOS).
// Only need to set event listeners.
CallxInstance.initialize({
  onIncomingCall: (data) => {
    console.log('📞 Incoming call', data);
  },
  onCallAnswered: (data) => {
    console.log('✅ Call answered', data);
  },
  onCallDeclined: (data) => {
    console.log('❌ Call declined', data);
  },
  onCallEnded: (data) => {
    console.log('📞 Call ended', data);
  },
  onCallMissed: (data) => {
    console.log('⏰ Call missed', data);
  },
  onCallAnsweredElsewhere: (data) => {
    console.log('📞 Call answered elsewhere', data);
  },
  onTokenUpdated: (tokenData) => {
    console.log('📱 Token updated', tokenData.token);
  },
});

AppRegistry.registerComponent(appName, () => App);
