import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  PermissionsAndroid,
  Platform,
  TextInput,
} from 'react-native';
import messaging from '@react-native-firebase/messaging';
import CallxInstance from '@bear-block/callx';

export default function App() {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isCallActive, setIsCallActive] = useState(false);
  const [currentCall, setCurrentCall] = useState<any | null>(null);
  const [fcmToken, setFcmToken] = useState<string>('');
  const [voipToken, setVoipToken] = useState<string>('');

  // Call control states
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerMode, setIsSpeakerMode] = useState(false);
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
      CallxInstance.initialize({
        onIncomingCall: (data: any) => {
          console.log('📞 Incoming call:', data);
          setCurrentCall(data);
          setIsCallActive(true);
        },
        onCallAnswered: (data: any) => {
          console.log('✅ Call answered:', data);
          setIsCallActive(false);
        },
        onCallDeclined: (data: any) => {
          console.log('❌ Call declined:', data);
          setIsCallActive(false);
        },
        onCallEnded: (data: any) => {
          console.log('📞 Call ended:', data);
          setIsCallActive(false);
          setCurrentCall(null);
        },
        onCallMissed: (data: any) => {
          console.log('⏰ Call missed:', data);
          setIsCallActive(false);
        },
        // NEW: Call control events
        onCallMuted: (data: any) => {
          console.log('🔇 Call muted:', data);
          setIsMuted(true);
        },
        onCallUnmuted: (data: any) => {
          console.log('🔊 Call unmuted:', data);
          setIsMuted(false);
        },
        onSpeakerModeChanged: (data: any) => {
          console.log('🔊 Speaker mode changed:', data);
          setIsSpeakerMode(data.isSpeakerMode || false);
        },
        onAudioRouteChanged: (data: any) => {
          console.log('🎧 Audio route changed:', data);
        },
        onCallQualityChanged: (data: any) => {
          console.log('📊 Call quality changed:', data);
        },
        onFCMTokenUpdated: (tokenData: { token: string }) => {
          console.log('📱 FCM token updated:', tokenData.token);
          setFcmToken(tokenData.token);
        },
      });

      setIsInitialized(true);
      console.log('✅ Callx initialized successfully');
    } catch (error) {
      console.error('❌ Callx initialization failed:', error);
      Alert.alert('Callx Error', 'Failed to initialize Callx');
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

  // Call control functions
  const handleMuteToggle = async () => {
    if (!currentCall?.callId) return;

    try {
      if (isMuted) {
        await CallxInstance.unmuteCall(currentCall.callId);
      } else {
        await CallxInstance.muteCall(currentCall.callId);
      }
    } catch (error) {
      console.error('Mute toggle failed:', error);
    }
  };

  const handleSpeakerToggle = async () => {
    try {
      await CallxInstance.setSpeakerMode(
        currentCall?.callId || '',
        !isSpeakerMode
      );
    } catch (error) {
      console.error('Speaker toggle failed:', error);
    }
  };

  const handleSendDTMF = async (digit: string) => {
    if (!currentCall?.callId) return;

    try {
      await CallxInstance.sendDTMF(currentCall.callId, digit);
      console.log('🔢 Sent DTMF:', digit);
    } catch (error) {
      console.error('DTMF send failed:', error);
    }
  };

  const handleSendDTMFSequence = async (sequence: string) => {
    if (!currentCall?.callId) return;

    try {
      await CallxInstance.sendDTMFSequence(currentCall.callId, sequence);
      console.log('🔢 Sent DTMF sequence:', sequence);
    } catch (error) {
      console.error('DTMF sequence failed:', error);
    }
  };

  const handleGetCallState = async () => {
    if (!currentCall?.callId) return;

    try {
      const state = await CallxInstance.getCallState(currentCall.callId);
      console.log('📊 Call state:', state);
      Alert.alert('Call State', JSON.stringify(state, null, 2));
    } catch (error) {
      console.error('Get call state failed:', error);
    }
  };

  const handleGetCallDuration = async () => {
    if (!currentCall?.callId) return;

    try {
      const duration = await CallxInstance.getCallDuration(currentCall.callId);
      console.log('⏱️ Call duration:', duration);
      Alert.alert('Call Duration', `${Math.round(duration / 1000)} seconds`);
    } catch (error) {
      console.error('Get call duration failed:', error);
    }
  };

  const handleGetConfiguration = async () => {
    try {
      const config = await CallxInstance.getConfiguration();
      console.log('📋 Configuration:', config);
      Alert.alert('Configuration', JSON.stringify(config, null, 2));
    } catch (error) {
      console.error('Get configuration failed:', error);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#f8f9fa" />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.title}>📞 Callx Example</Text>
          <Text style={styles.subtitle}>React Native Call Library</Text>
        </View>

        {/* Status Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📊 Status</Text>
          <View style={styles.statusGrid}>
            <View style={styles.statusItem}>
              <Text style={styles.statusLabel}>Initialized</Text>
              <Text
                style={[
                  styles.statusValue,
                  { color: isInitialized ? '#28a745' : '#dc3545' },
                ]}
              >
                {isInitialized ? '✅' : '❌'}
              </Text>
            </View>
            <View style={styles.statusItem}>
              <Text style={styles.statusLabel}>Call Active</Text>
              <Text
                style={[
                  styles.statusValue,
                  { color: isCallActive ? '#28a745' : '#6c757d' },
                ]}
              >
                {isCallActive ? '✅' : '❌'}
              </Text>
            </View>
            <View style={styles.statusItem}>
              <Text style={styles.statusLabel}>Muted</Text>
              <Text
                style={[
                  styles.statusValue,
                  { color: isMuted ? '#ffc107' : '#6c757d' },
                ]}
              >
                {isMuted ? '🎤' : '🔇'}
              </Text>
            </View>
            <View style={styles.statusItem}>
              <Text style={styles.statusLabel}>Speaker</Text>
              <Text
                style={[
                  styles.statusValue,
                  { color: isSpeakerMode ? '#17a2b8' : '#6c757d' },
                ]}
              >
                {isSpeakerMode ? '🔊' : '📱'}
              </Text>
            </View>
          </View>
        </View>

        {/* Call Control Section - NEW */}
        {isCallActive && currentCall && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>🎛️ Call Controls</Text>
            <View style={styles.buttonGrid}>
              <TouchableOpacity
                style={[styles.button, isMuted && styles.buttonActive]}
                onPress={handleMuteToggle}
              >
                <Text style={styles.buttonText}>
                  {isMuted ? '🎤 Unmute' : '🔇 Mute'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.button, isSpeakerMode && styles.buttonActive]}
                onPress={handleSpeakerToggle}
              >
                <Text style={styles.buttonText}>
                  {isSpeakerMode ? '📱 Earpiece' : '🔊 Speaker'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.button}
                onPress={handleGetCallState}
              >
                <Text style={styles.buttonText}>📊 State</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.button}
                onPress={handleGetCallDuration}
              >
                <Text style={styles.buttonText}>⏱️ Duration</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.button}
                onPress={handleGetConfiguration}
              >
                <Text style={styles.buttonText}>📋 Config</Text>
              </TouchableOpacity>
            </View>

            {/* DTMF Keypad - NEW */}
            <View style={styles.dtmfSection}>
              <Text style={styles.sectionSubtitle}>🔢 DTMF Keypad</Text>
              <View style={styles.dtmfGrid}>
                {[
                  '1',
                  '2',
                  '3',
                  '4',
                  '5',
                  '6',
                  '7',
                  '8',
                  '9',
                  '*',
                  '0',
                  '#',
                ].map((digit) => (
                  <TouchableOpacity
                    key={digit}
                    style={styles.dtmfButton}
                    onPress={() => handleSendDTMF(digit)}
                  >
                    <Text style={styles.dtmfButtonText}>{digit}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity
                style={styles.button}
                onPress={() => handleSendDTMFSequence('123456')}
              >
                <Text style={styles.buttonText}>🔢 Send Sequence (123456)</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

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
  statusGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-around',
    marginTop: 10,
  },
  statusItem: {
    width: '45%', // Adjust as needed for 2 columns
    marginBottom: 10,
    alignItems: 'center',
  },
  statusLabel: {
    fontSize: 14,
    color: '#34495e',
    marginBottom: 5,
  },
  statusValue: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  buttonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-around',
    marginTop: 10,
  },
  button: {
    backgroundColor: '#3498db',
    borderRadius: 8,
    padding: 15,
    marginBottom: 10,
    alignItems: 'center',
    width: '45%', // Adjust as needed for 2 columns
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonActive: {
    backgroundColor: '#27ae60', // Example active color
  },
  dtmfSection: {
    marginTop: 20,
    paddingTop: 15,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  sectionSubtitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginBottom: 10,
  },
  dtmfGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-around',
  },
  dtmfButton: {
    backgroundColor: '#ecf0f1',
    borderRadius: 8,
    padding: 15,
    margin: 5,
    alignItems: 'center',
    width: '20%', // Adjust as needed for 10 columns
  },
  dtmfButtonText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#34495e',
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
