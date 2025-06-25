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
} from 'react-native';
import CallxInstance, { multiply, type CallData } from 'callx';

export default function App() {
  const [isInitialized, setIsInitialized] = useState(false);
  const [currentCall, setCurrentCall] = useState<CallData | null>(null);
  const [isCallActive, setIsCallActive] = useState(false);
  const [testCallData, setTestCallData] = useState({
    callId: 'test-call-' + Date.now(),
    callerName: 'John Doe',
    callerPhone: '+1234567890',
    callerAvatar: 'https://picsum.photos/200/200',
  });

  // Legacy test
  const multiplyResult = multiply(3, 7);

  useEffect(() => {
    initializeCallx();
  }, []);

  const initializeCallx = async () => {
    try {
      await CallxInstance.initialize({
        triggers: {
          incoming: {
            field: 'data.type',
            value: 'call.started',
          },
          ended: {
            field: 'data.type',
            value: 'call.ended',
          },
          missed: {
            field: 'data.type',
            value: 'call.missed',
          },
        },
        fields: {
          callId: {
            field: 'data.callId',
            fallback: 'unknown-call',
          },
          callerName: {
            field: 'data.callerName',
            fallback: 'Unknown Caller',
          },
          callerPhone: {
            field: 'data.callerPhone',
            fallback: 'No Number',
          },
          callerAvatar: {
            field: 'data.callerAvatar',
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
        data: {
          type: 'call.started',
          callId: 'fcm-call-' + Date.now(),
          callerName: 'FCM Test Caller',
          callerPhone: '+0987654321',
          callerAvatar: 'https://picsum.photos/300/300',
        },
      };

      await CallxInstance.handleFcmMessage(fcmData);
      await refreshCallStatus();
      Alert.alert('✅ Success', 'FCM message processed!');
    } catch (error) {
      console.error('Error handling FCM:', error);
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
});
