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
  const [_isInitializing, _setIsInitializing] = useState(true);
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

      // Handle foreground messages
      const unsubscribe = messaging().onMessage(async (remoteMessage) => {
        console.log('📱 FCM Foreground message:', remoteMessage);
        console.log(
          '📱 Full message structure:',
          JSON.stringify(remoteMessage, null, 2)
        );

        // Handle both data-only and notification+data messages
        const messageData = remoteMessage.data || {};
        const notificationData = remoteMessage.notification || {};

        console.log('📊 Message data:', messageData);
        console.log('📊 Message data type:', typeof messageData);
        console.log('📊 Message data keys:', Object.keys(messageData));
        console.log('🔔 Notification:', notificationData);

        if (messageData.type === 'call.started') {
          console.log('🎯 Processing call.started message');
          await CallxInstance.handleFcmMessage(messageData);
          await refreshCallStatus();
        } else if (messageData.type === 'call.ended') {
          console.log('🎯 Processing call.ended message');
          await CallxInstance.handleFcmMessage(messageData);
          await refreshCallStatus();
        } else if (
          notificationData.title === 'Incoming Call' ||
          notificationData.body?.includes('call')
        ) {
          // Fallback: detect call from notification content
          console.log('🔍 Detected call from notification content');
          // Extract data from custom data fields if available
          if (messageData.callId || messageData.callerName) {
            await CallxInstance.handleFcmMessage({
              type: 'call.started',
              ...messageData,
            });
            await refreshCallStatus();
          }
        } else {
          console.log('⚠️ FCM message not recognized as call:');
          console.log('   - messageData.type:', messageData.type);
          console.log('   - messageData keys:', Object.keys(messageData));
          console.log('   - notification title:', notificationData.title);
          console.log(
            '   - Full messageData:',
            JSON.stringify(messageData, null, 2)
          );

          // Try to process anyway if it has call data
          if (messageData.callId && messageData.callerName) {
            console.log(
              '🔧 Attempting to process as call despite missing type'
            );
            await CallxInstance.handleFcmMessage({
              type: 'call.started',
              ...messageData,
            });
            await refreshCallStatus();
          } else if (messageData.type) {
            console.log('🔧 Has type but not call.started, trying anyway...');
            await CallxInstance.handleFcmMessage(messageData);
            await refreshCallStatus();
          }
        }
      });

      // Handle background messages
      messaging().setBackgroundMessageHandler(async (remoteMessage) => {
        console.log('📱 FCM Background message:', remoteMessage);
        console.log(
          '📱 Background full message:',
          JSON.stringify(remoteMessage, null, 2)
        );

        const messageData = remoteMessage.data || {};
        const notificationData = remoteMessage.notification || {};

        console.log('📊 Background message data:', messageData);
        console.log('📊 Background data keys:', Object.keys(messageData));

        if (messageData.type === 'call.started') {
          await CallxInstance.handleFcmMessage(messageData);
        } else if (
          notificationData.title === 'Incoming Call' ||
          notificationData.body?.includes('call')
        ) {
          if (messageData.callId || messageData.callerName) {
            await CallxInstance.handleFcmMessage({
              type: 'call.started',
              ...messageData,
            });
          }
        }
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
      await CallxInstance.initialize({
        triggers: {
          incoming: {
            field: 'type',
            value: 'call.started',
          },
          ended: {
            field: 'type',
            value: 'call.ended',
          },
          missed: {
            field: 'type',
            value: 'call.missed',
          },
        },
        fields: {
          callId: {
            field: 'callId',
            fallback: 'unknown-call',
          },
          callerName: {
            field: 'callerName',
            fallback: 'Unknown Caller',
          },
          callerPhone: {
            field: 'callerPhone',
            fallback: 'No Number',
          },
          callerAvatar: {
            field: 'callerAvatar',
            fallback: 'https://picsum.photos/200/200',
          },
        },
        notification: {
          channelId: 'callx_test_calls',
          channelName: 'Test Calls',
          channelDescription: 'Test notifications for Callx',
          importance: 'high',
          sound: 'default',
        },
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
      Alert.alert('✅ Success', 'Callx initialized successfully!');
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
            </>
          )}

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
