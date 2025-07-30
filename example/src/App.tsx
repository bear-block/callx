import { useState, useEffect } from 'react';
import {
  Text,
  View,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  TextInput,
  SafeAreaView,
  StatusBar,
  PermissionsAndroid,
  Platform,
} from 'react-native';
import CallxInstance, { type CallData } from '@bear-block/callx';
import messaging from '@react-native-firebase/messaging';

export default function App() {
  const [isInitialized, setIsInitialized] = useState(false);
  const [currentCall, setCurrentCall] = useState<CallData | null>(null);
  const [isCallActive, setIsCallActive] = useState(false);
  const [fcmToken, setFcmToken] = useState<string>('');
  const [voipToken, setVoipToken] = useState<string>('');
  const [testCallData, setTestCallData] = useState({
    callId: 'test-call-' + Date.now(),
    callerName: 'John Doe',
    callerPhone: '+1234567890',
    callerAvatar: 'https://picsum.photos/200/200',
    hasVideo: false,
  });

  useEffect(() => {
    // Delay initialization to prevent hanging
    const timer = setTimeout(() => {
      initializeApp();
    }, 100);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const initializeApp = async () => {
    try {
      console.log('🚀 Initializing app...');

      console.log('1️⃣ Requesting permissions...');
      await requestPermissions();

      console.log('2️⃣ Initializing Callx...');
      await initializeCallx();

      console.log('3️⃣ Initializing FCM (with Callx integration)...');
      await initializeFCM();

      console.log('✅ App initialization complete!');
    } catch (error) {
      console.error('❌ App initialization failed:', error);
      Alert.alert(
        'Initialization Error',
        'App failed to initialize properly. Some features may not work.'
      );
    }
  };

  const requestPermissions = async () => {
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
          {
            title: 'Microphone Permission',
            message: 'This app needs access to microphone for calls',
            buttonNeutral: 'Ask Me Later',
            buttonNegative: 'Cancel',
            buttonPositive: 'OK',
          }
        );
        if (granted === PermissionsAndroid.RESULTS.GRANTED) {
          console.log('✅ Microphone permission granted');
        } else {
          console.log('❌ Microphone permission denied');
        }
      } catch (err) {
        console.warn('⚠️ Permission request failed:', err);
      }
    }
  };

  const initializeFCM = async () => {
    try {
      console.log('🔧 Starting FCM initialization...');

      // Request permission
      const authStatus = await messaging().requestPermission();
      const enabled =
        authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
        authStatus === messaging.AuthorizationStatus.PROVISIONAL;

      if (enabled) {
        console.log('🔔 FCM authorization status:', authStatus);

        // Get FCM token
        const token = await messaging().getToken();
        setFcmToken(token);
        console.log('📱 FCM Token:', token);

        // Listen for token refresh
        messaging().onTokenRefresh((newToken) => {
          console.log('📱 FCM token refreshed:', newToken);
          setFcmToken(newToken);
        });

        // Listen for foreground messages
        const unsubscribe = messaging().onMessage(async (remoteMessage) => {
          console.log('📱 FCM foreground message received:', remoteMessage);
          Alert.alert('FCM Message', 'Received foreground message');

          // Handle call data if present
          if (remoteMessage.data) {
            await CallxInstance.handleFcmMessage(remoteMessage.data);
            await refreshCallStatus();
          }
        });

        // Handle background messages (mostly handled by native service now)
        messaging().setBackgroundMessageHandler(async (remoteMessage) => {
          console.log('📱 FCM background message received:', remoteMessage);
          return Promise.resolve();
        });

        return () => {
          unsubscribe();
        };
      } else {
        console.log('❌ FCM permission denied');
        Alert.alert('FCM Permission', 'Push notifications are disabled');
      }

      return () => {}; // Return empty cleanup function on error
    } catch (error) {
      console.error('❌ FCM initialization failed:', error);
      return () => {}; // Return empty cleanup function on error
    }
  };

  const initializeCallx = async () => {
    try {
      // Config is now baked into native code from callx.json
      // Only need to set event listeners
      await CallxInstance.initialize({
        onIncomingCall: (callData) => {
          console.log('📞 Incoming call received:', callData);
          Alert.alert('Incoming Call', `${callData.callerName} is calling...`);
        },
        onCallEnded: (callData) => {
          console.log('📵 Call ended:', callData);
          Alert.alert('Call Ended', 'Call has ended');
        },
        onCallMissed: (callData) => {
          console.log('📵 Call missed:', callData);
          Alert.alert('Missed Call', `Missed call from ${callData.callerName}`);
        },
        onCallAnswered: (callData) => {
          console.log('✅ Call answered:', callData);
          Alert.alert(
            'Call Answered',
            `Call with ${callData.callerName} started`
          );
        },
        onCallDeclined: (callData) => {
          console.log('❌ Call declined:', callData);
          Alert.alert(
            'Call Declined',
            `Call from ${callData.callerName} declined`
          );
        },
        onVoIPTokenUpdated: (tokenData) => {
          console.log('📱 VoIP token updated:', tokenData.token);
          setVoipToken(tokenData.token);
          Alert.alert(
            'VoIP Token Updated',
            `New token: ${tokenData.token.substring(0, 20)}...`
          );
        },
      });

      setIsInitialized(true);
    } catch (error) {
      console.error('❌ Initialization error:', error);
      Alert.alert('❌ Error', `Failed to initialize: ${error}`);
    }
  };

  const refreshCallStatus = async () => {
    try {
      const current = await CallxInstance.getCurrentCall();
      const active = await CallxInstance.isCallActive();
      setCurrentCall(current);
      setIsCallActive(active);
    } catch (error) {
      console.error('Error refreshing status:', error);
    }
  };

  const showTestCall = async () => {
    try {
      await CallxInstance.showIncomingCall(testCallData);
      Alert.alert('✅ Test Call', 'Incoming call displayed!');
    } catch (error) {
      console.error('❌ Test call error:', error);
      Alert.alert('❌ Error', `Failed to show test call: ${error}`);
    }
  };

  const getVoIPToken = async () => {
    try {
      const token = await CallxInstance.getVoIPToken();
      setVoipToken(token);
      Alert.alert('📱 VoIP Token', `Token: ${token.substring(0, 20)}...`);
    } catch (error) {
      console.error('❌ VoIP token error:', error);
      Alert.alert('❌ Error', `Failed to get VoIP token: ${error}`);
    }
  };

  const getFCMToken = async () => {
    try {
      const token = await CallxInstance.getFCMToken();
      setFcmToken(token);
      Alert.alert('🔥 FCM Token', `Token: ${token.substring(0, 20)}...`);
    } catch (error) {
      console.error('❌ FCM token error:', error);
      Alert.alert('❌ Error', `Failed to get FCM token: ${error}`);
    }
  };

  const handleFcmTest = async () => {
    try {
      const testData = {
        type: 'call.started',
        callId: 'fcm-test-' + Date.now(),
        callerName: 'FCM Test Caller',
        callerPhone: '+1234567890',
        callerAvatar: 'https://picsum.photos/200/200',
      };

      await CallxInstance.handleFcmMessage(testData);
      Alert.alert('✅ FCM Test', 'FCM message handled!');
    } catch (error) {
      console.error('❌ FCM test error:', error);
      Alert.alert('❌ Error', `Failed to handle FCM message: ${error}`);
    }
  };

  const endCurrentCall = async () => {
    try {
      if (currentCall) {
        await CallxInstance.endCall(currentCall.callId);
        Alert.alert('✅ Call Ended', 'Current call ended!');
        await refreshCallStatus();
      } else {
        Alert.alert('ℹ️ No Active Call', 'No call to end');
      }
    } catch (error) {
      console.error('❌ End call error:', error);
      Alert.alert('❌ Error', `Failed to end call: ${error}`);
    }
  };

  const answerCurrentCall = async () => {
    try {
      if (currentCall) {
        await CallxInstance.answerCall(currentCall.callId);
        Alert.alert('✅ Call Answered', 'Call answered!');
      } else {
        Alert.alert('ℹ️ No Active Call', 'No call to answer');
      }
    } catch (error) {
      console.error('❌ Answer call error:', error);
      Alert.alert('❌ Error', `Failed to answer call: ${error}`);
    }
  };

  const declineCurrentCall = async () => {
    try {
      if (currentCall) {
        await CallxInstance.declineCall(currentCall.callId);
        Alert.alert('❌ Call Declined', 'Call declined!');
        await refreshCallStatus();
      } else {
        Alert.alert('ℹ️ No Active Call', 'No call to decline');
      }
    } catch (error) {
      console.error('❌ Decline call error:', error);
      Alert.alert('❌ Error', `Failed to decline call: ${error}`);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#f8f9fa" />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.title}>📞 Callx Example</Text>
          <Text style={styles.subtitle}>
            React Native Incoming Call Library
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🔧 Status</Text>
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Initialized:</Text>
            <Text
              style={[
                styles.statusValue,
                { color: isInitialized ? '#28a745' : '#dc3545' },
              ]}
            >
              {isInitialized ? '✅ Yes' : '❌ No'}
            </Text>
          </View>
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Call Active:</Text>
            <Text
              style={[
                styles.statusValue,
                { color: isCallActive ? '#28a745' : '#6c757d' },
              ]}
            >
              {isCallActive ? '📞 Yes' : '📵 No'}
            </Text>
          </View>
          {currentCall && (
            <View style={styles.callInfo}>
              <Text style={styles.callInfoTitle}>Current Call:</Text>
              <Text style={styles.callInfoText}>
                Name: {currentCall.callerName}
              </Text>
              <Text style={styles.callInfoText}>
                Phone: {currentCall.callerPhone}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🔑 Tokens</Text>
          <View style={styles.tokenContainer}>
            <Text style={styles.tokenLabel}>FCM Token:</Text>
            <Text style={styles.tokenValue} numberOfLines={2}>
              {fcmToken ? `${fcmToken.substring(0, 30)}...` : 'Not available'}
            </Text>
          </View>
          {Platform.OS === 'ios' && (
            <View style={styles.tokenContainer}>
              <Text style={styles.tokenLabel}>VoIP Token:</Text>
              <Text style={styles.tokenValue} numberOfLines={2}>
                {voipToken
                  ? `${voipToken.substring(0, 30)}...`
                  : 'Not available'}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🧪 Testing</Text>
          <TouchableOpacity style={styles.button} onPress={showTestCall}>
            <Text style={styles.buttonText}>📞 Show Test Call</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.button} onPress={handleFcmTest}>
            <Text style={styles.buttonText}>📨 Test FCM Message</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.button} onPress={getFCMToken}>
            <Text style={styles.buttonText}>🔥 Get FCM Token</Text>
          </TouchableOpacity>
          {Platform.OS === 'ios' && (
            <TouchableOpacity style={styles.button} onPress={getVoIPToken}>
              <Text style={styles.buttonText}>📱 Get VoIP Token</Text>
            </TouchableOpacity>
          )}
          {isCallActive && (
            <>
              <TouchableOpacity
                style={[styles.button, styles.answerButton]}
                onPress={answerCurrentCall}
              >
                <Text style={styles.buttonText}>✅ Answer Call</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.declineButton]}
                onPress={declineCurrentCall}
              >
                <Text style={styles.buttonText}>❌ Decline Call</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.endButton]}
                onPress={endCurrentCall}
              >
                <Text style={styles.buttonText}>📵 End Call</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📋 Configuration</Text>
          <View style={styles.configRow}>
            <Text style={styles.configLabel}>Call ID:</Text>
            <TextInput
              style={styles.configInput}
              value={testCallData.callId}
              onChangeText={(text) =>
                setTestCallData({ ...testCallData, callId: text })
              }
              placeholder="Enter call ID"
            />
          </View>
          <View style={styles.configRow}>
            <Text style={styles.configLabel}>Caller Name:</Text>
            <TextInput
              style={styles.configInput}
              value={testCallData.callerName}
              onChangeText={(text) =>
                setTestCallData({ ...testCallData, callerName: text })
              }
              placeholder="Enter caller name"
            />
          </View>
          <View style={styles.configRow}>
            <Text style={styles.configLabel}>Caller Phone:</Text>
            <TextInput
              style={styles.configInput}
              value={testCallData.callerPhone}
              onChangeText={(text) =>
                setTestCallData({ ...testCallData, callerPhone: text })
              }
              placeholder="Enter phone number"
            />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  scrollContent: {
    padding: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 30,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#7f8c8d',
    textAlign: 'center',
  },
  section: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginBottom: 15,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  statusLabel: {
    fontSize: 16,
    color: '#34495e',
  },
  statusValue: {
    fontSize: 16,
    fontWeight: '600',
  },
  callInfo: {
    backgroundColor: '#e8f5e8',
    borderRadius: 8,
    padding: 15,
    marginTop: 10,
  },
  callInfoTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#27ae60',
    marginBottom: 8,
  },
  callInfoText: {
    fontSize: 14,
    color: '#2c3e50',
    marginBottom: 4,
  },
  tokenContainer: {
    marginBottom: 15,
  },
  tokenLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#34495e',
    marginBottom: 5,
  },
  tokenValue: {
    fontSize: 12,
    color: '#7f8c8d',
    fontFamily: 'monospace',
    backgroundColor: '#f8f9fa',
    padding: 8,
    borderRadius: 4,
  },
  button: {
    backgroundColor: '#3498db',
    borderRadius: 8,
    padding: 15,
    marginBottom: 10,
    alignItems: 'center',
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  answerButton: {
    backgroundColor: '#27ae60',
  },
  declineButton: {
    backgroundColor: '#e74c3c',
  },
  endButton: {
    backgroundColor: '#f39c12',
  },
  configRow: {
    marginBottom: 15,
  },
  configLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#34495e',
    marginBottom: 5,
  },
  configInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 6,
    padding: 10,
    fontSize: 16,
    backgroundColor: 'white',
  },
});
