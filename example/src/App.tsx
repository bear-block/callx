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
import CallxInstance, { multiply, type CallData } from 'callx';
import messaging from '@react-native-firebase/messaging';

export default function App() {
  const [isInitialized, setIsInitialized] = useState(false);
  const [currentCall, setCurrentCall] = useState<CallData | null>(null);
  const [isCallActive, setIsCallActive] = useState(false);
  const [fcmToken, setFcmToken] = useState<string>('');
  const [testCallData, setTestCallData] = useState({
    callId: 'test-call-' + Date.now(),
    callerName: 'John Doe',
    callerPhone: '+1234567890',
    callerAvatar: 'https://picsum.photos/200/200',
  });

  // Legacy test
  const multiplyResult = multiply(3, 7);

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

      console.log('2️⃣ Initializing FCM...');
      await initializeFCM();

      console.log('3️⃣ Initializing Callx...');
      await initializeCallx();

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
        console.log('📋 Requesting FCM permissions...');

        // Request notification permission for Android 13+ FIRST
        if (Platform.Version >= 33) {
          console.log('📱 Requesting POST_NOTIFICATIONS for Android 13+...');
          const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
            {
              title: 'Notification Permission',
              message:
                'This app needs notification access to show incoming calls',
              buttonNeutral: 'Ask Me Later',
              buttonNegative: 'Cancel',
              buttonPositive: 'OK',
            }
          );
          console.log('📋 POST_NOTIFICATIONS result:', granted);
        }

        // Then request FCM permission
        const authStatus = await messaging().requestPermission();
        const enabled =
          authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
          authStatus === messaging.AuthorizationStatus.PROVISIONAL;

        console.log(
          '✅ FCM Authorization status:',
          authStatus,
          'Enabled:',
          enabled
        );
      } catch (error) {
        console.error('❌ Permission request error:', error);
      }
    }
  };

  const initializeFCM = async () => {
    try {
      console.log('🔧 Starting FCM initialization...');

      // Get FCM token
      const token = await messaging().getToken();
      setFcmToken(token);
      console.log('🔥 FCM Token:', token);

      // Listen for token refresh
      messaging().onTokenRefresh((refreshedToken) => {
        setFcmToken(refreshedToken);
        console.log('🔄 FCM Token refreshed:', refreshedToken);
      });

      // Handle foreground messages (optional - native service handles most cases)
      const unsubscribe = messaging().onMessage(async (remoteMessage) => {
        console.log('📱 FCM Foreground message (JS layer):', remoteMessage);

        // Native service will handle the heavy lifting
        // JS layer only needs to update UI state if needed
        const messageData = remoteMessage.data || {};

        if (
          messageData.type === 'call.started' ||
          messageData.type === 'call.ended'
        ) {
          console.log('🔄 Refreshing call status from foreground FCM');
          await refreshCallStatus();
        }
      });

      // Handle background messages (mostly handled by native service now)
      messaging().setBackgroundMessageHandler(async (remoteMessage) => {
        console.log('📱 FCM Background message (JS layer):', remoteMessage);

        // Native service handles the actual processing
        // This is just for logging or any JS-specific logic
        const messageData = remoteMessage.data || {};
        console.log('📊 Background data keys:', Object.keys(messageData));

        // No need to process - native service handles it
        console.log('✅ Background message delegated to native service');
      });

      return unsubscribe;
    } catch (error: any) {
      console.error('❌ FCM initialization error:', error);
      console.error('❌ Error details:', error?.message || 'Unknown error');
      console.error('❌ Error code:', error?.code || 'No code');
      Alert.alert('FCM Error', `FCM failed: ${error?.message || error}`);
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
      await refreshCallStatus();
      Alert.alert('✅ Success', 'Test call shown!');
    } catch (error) {
      console.error('Error showing call:', error);
      Alert.alert('❌ Error', `Failed to show call: ${error}`);
    }
  };

  const answerCall = async () => {
    if (currentCall) {
      try {
        await CallxInstance.answerCall(currentCall.callId);
        await refreshCallStatus();
      } catch (error) {
        console.error('Error answering call:', error);
        Alert.alert('❌ Error', `Failed to answer call: ${error}`);
      }
    }
  };

  const declineCall = async () => {
    if (currentCall) {
      try {
        await CallxInstance.declineCall(currentCall.callId);
        await refreshCallStatus();
      } catch (error) {
        console.error('Error declining call:', error);
        Alert.alert('❌ Error', `Failed to decline call: ${error}`);
      }
    }
  };

  const endCall = async () => {
    if (currentCall) {
      try {
        await CallxInstance.endCall(currentCall.callId);
        await refreshCallStatus();
      } catch (error) {
        console.error('Error ending call:', error);
        Alert.alert('❌ Error', `Failed to end call: ${error}`);
      }
    }
  };

  const testFcmMessage = async () => {
    try {
      const fcmData = {
        type: 'call.started',
        callId: 'fcm-call-' + Date.now(),
        callerName: 'FCM Test Caller',
        callerPhone: '+0987654321',
        callerAvatar: 'https://picsum.photos/300/300',
      };

      console.log(
        '🧪 Test FCM Data being sent:',
        JSON.stringify(fcmData, null, 2)
      );
      console.log('🧪 Calling handleFcmMessage...');

      await CallxInstance.handleFcmMessage(fcmData);

      console.log('🧪 handleFcmMessage completed');
      await refreshCallStatus();
      Alert.alert('✅ Success', 'FCM message processed!');
    } catch (error) {
      console.error('❌ Test FCM Error:', error);
      console.error('❌ Error stack:', (error as Error)?.stack);
      Alert.alert('❌ Error', `Failed to handle FCM: ${error}`);
    }
  };

  const hideFromLockScreen = async () => {
    try {
      const result = await CallxInstance.hideFromLockScreen();
      if (result) {
        Alert.alert(
          '✅ Success',
          'App successfully hidden from lock screen and moved to background'
        );
      } else {
        Alert.alert('⚠️ Warning', 'Failed to hide app from lock screen');
      }
    } catch (error) {
      console.error('Error hiding app from lock screen:', error);
      Alert.alert('❌ Error', `Failed to hide from lock screen: ${error}`);
    }
  };

  const moveToBackground = async () => {
    try {
      const result = await CallxInstance.moveAppToBackground();
      if (result) {
        console.log('✅ App successfully moved to background');
        // Note: This will minimize the app, so user won't see the alert immediately
      } else {
        Alert.alert('⚠️ Warning', 'Failed to move app to background');
      }
    } catch (error) {
      console.error('Error moving app to background:', error);
      Alert.alert('❌ Error', `Failed to move to background: ${error}`);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#f0f0f0" />

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>📞 Callx Testing App</Text>

        {/* Status Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📊 Status</Text>
          <Text style={styles.statusText}>
            ✅ Initialized: {isInitialized ? 'Yes' : 'No'}
          </Text>
          <Text style={styles.statusText}>
            📞 Call Active: {isCallActive ? 'Yes' : 'No'}
          </Text>
          <Text style={styles.statusText}>
            🧮 Multiply Test: 3 × 7 = {multiplyResult}
          </Text>
        </View>

        {/* FCM Token Section */}
        {fcmToken && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>🔥 FCM Token</Text>
            <Text style={styles.tokenText} selectable>
              {fcmToken}
            </Text>
            <TouchableOpacity
              style={[styles.button, styles.infoButton]}
              onPress={() => {
                Alert.alert('FCM Token', fcmToken, [
                  {
                    text: 'Copy',
                    onPress: () => console.log('Token copied:', fcmToken),
                  },
                  { text: 'OK' },
                ]);
              }}
            >
              <Text style={styles.buttonText}>📋 Copy Token</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Current Call Section */}
        {currentCall && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>📞 Current Call</Text>
            <Text style={styles.callText}>ID: {currentCall.callId}</Text>
            <Text style={styles.callText}>
              Caller: {currentCall.callerName}
            </Text>
            <Text style={styles.callText}>
              Phone: {currentCall.callerPhone}
            </Text>
            {currentCall.callerAvatar && (
              <Text style={styles.callText}>
                Avatar: {currentCall.callerAvatar}
              </Text>
            )}
          </View>
        )}

        {/* Test Call Configuration */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>⚙️ Test Call Configuration</Text>

          <TextInput
            style={styles.input}
            placeholder="Caller Name"
            value={testCallData.callerName}
            onChangeText={(text) =>
              setTestCallData({ ...testCallData, callerName: text })
            }
          />

          <TextInput
            style={styles.input}
            placeholder="Caller Phone"
            value={testCallData.callerPhone}
            onChangeText={(text) =>
              setTestCallData({ ...testCallData, callerPhone: text })
            }
          />

          <TextInput
            style={styles.input}
            placeholder="Caller Avatar URL"
            value={testCallData.callerAvatar}
            onChangeText={(text) =>
              setTestCallData({ ...testCallData, callerAvatar: text })
            }
          />
        </View>

        {/* Action Buttons */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🎮 Actions</Text>

          <TouchableOpacity
            style={[styles.button, styles.primaryButton]}
            onPress={refreshCallStatus}
          >
            <Text style={styles.buttonText}>🔄 Refresh Status</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.successButton]}
            onPress={showTestCall}
            disabled={!isInitialized}
          >
            <Text style={styles.buttonText}>📞 Show Test Call</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.infoButton]}
            onPress={testFcmMessage}
            disabled={!isInitialized}
          >
            <Text style={styles.buttonText}>🔥 Test FCM Message</Text>
          </TouchableOpacity>

          {currentCall && (
            <>
              <TouchableOpacity
                style={[styles.button, styles.successButton]}
                onPress={answerCall}
              >
                <Text style={styles.buttonText}>✅ Answer Call</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.button, styles.dangerButton]}
                onPress={declineCall}
              >
                <Text style={styles.buttonText}>❌ Decline Call</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.button, styles.warningButton]}
                onPress={endCall}
              >
                <Text style={styles.buttonText}>📵 End Call</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.button, styles.infoButton]}
                onPress={hideFromLockScreen}
              >
                <Text style={styles.buttonText}>🔒 Hide from Lock Screen</Text>
              </TouchableOpacity>
            </>
          )}

          <TouchableOpacity
            style={[styles.button, styles.warningButton]}
            onPress={moveToBackground}
          >
            <Text style={styles.buttonText}>🏠 Move to Background</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.primaryButton]}
            onPress={initializeCallx}
          >
            <Text style={styles.buttonText}>🔄 Re-Initialize</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0f0f0',
  },
  content: {
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 20,
    color: '#333',
  },
  section: {
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 15,
    marginBottom: 15,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#333',
  },
  statusText: {
    fontSize: 16,
    marginBottom: 5,
    color: '#666',
  },
  callText: {
    fontSize: 14,
    marginBottom: 3,
    color: '#555',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
    backgroundColor: '#f9f9f9',
    fontSize: 16,
  },
  button: {
    padding: 15,
    borderRadius: 8,
    marginBottom: 10,
    alignItems: 'center',
  },
  primaryButton: {
    backgroundColor: '#007AFF',
  },
  successButton: {
    backgroundColor: '#28a745',
  },
  dangerButton: {
    backgroundColor: '#dc3545',
  },
  warningButton: {
    backgroundColor: '#ffc107',
  },
  infoButton: {
    backgroundColor: '#17a2b8',
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  tokenText: {
    fontSize: 12,
    color: '#666',
    backgroundColor: '#f5f5f5',
    padding: 8,
    borderRadius: 4,
    fontFamily: 'monospace',
    marginBottom: 10,
  },
});
