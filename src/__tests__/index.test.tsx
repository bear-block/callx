import CallxInstance from '../index';

// Mock the native module
jest.mock('../NativeCallx', () => ({
  __esModule: true,
  default: {
    initialize: jest.fn().mockResolvedValue(undefined),
    muteCall: jest.fn().mockResolvedValue(undefined),
    unmuteCall: jest.fn().mockResolvedValue(undefined),
    isMuted: jest.fn().mockResolvedValue(false),
    setSpeakerMode: jest.fn().mockResolvedValue(undefined),
    isSpeakerMode: jest.fn().mockResolvedValue(false),
    sendDTMF: jest.fn().mockResolvedValue(undefined),
    sendDTMFSequence: jest.fn().mockResolvedValue(undefined),
    getCallState: jest.fn().mockRejectedValue(new Error('Call not found')),
    getCallDuration: jest.fn().mockRejectedValue(new Error('Call not found')),
    handleFcmMessage: jest.fn().mockResolvedValue(undefined),
    getFCMToken: jest.fn().mockResolvedValue('mock-fcm-token'),
    getVoIPToken: jest.fn().mockResolvedValue('mock-voip-token'),
  },
}));

describe('Callx', () => {
  it('should initialize successfully', async () => {
    const mockConfig = {
      onIncomingCall: jest.fn(),
      onCallEnded: jest.fn(),
      onCallMissed: jest.fn(),
      onCallAnswered: jest.fn(),
      onCallDeclined: jest.fn(),
    };

    await expect(CallxInstance.initialize(mockConfig)).resolves.not.toThrow();
  });

  it('should handle mute/unmute calls', async () => {
    const callId = 'test-call-123';

    await expect(CallxInstance.muteCall(callId)).resolves.not.toThrow();
    await expect(CallxInstance.isMuted(callId)).resolves.toBe(false);
    await expect(CallxInstance.unmuteCall(callId)).resolves.not.toThrow();
  });

  it('should handle speaker mode', async () => {
    await expect(
      CallxInstance.setSpeakerMode('test-call-id', true)
    ).resolves.not.toThrow();
    await expect(CallxInstance.isSpeakerMode('test-call-id')).resolves.toBe(
      false
    );
    await expect(
      CallxInstance.setSpeakerMode('test-call-id', false)
    ).resolves.not.toThrow();
  });

  it('should handle DTMF', async () => {
    const callId = 'test-call-123';

    await expect(CallxInstance.sendDTMF(callId, '1')).resolves.not.toThrow();
    await expect(
      CallxInstance.sendDTMFSequence(callId, '123')
    ).resolves.not.toThrow();
  });

  it('should get call state and duration', async () => {
    const callId = 'test-call-123';

    await expect(CallxInstance.getCallState(callId)).rejects.toThrow();
    await expect(CallxInstance.getCallDuration(callId)).rejects.toThrow();
  });

  it('should handle FCM messages', async () => {
    const mockFcmData = {
      type: 'call.started',
      callId: 'test-call-123',
      callerName: 'Test User',
      callerPhone: '+1234567890',
    };

    await expect(
      CallxInstance.handleFcmMessage(mockFcmData)
    ).resolves.not.toThrow();
  });

  it('should get tokens', async () => {
    await expect(CallxInstance.getFCMToken()).resolves.toBeDefined();
    await expect(CallxInstance.getVoIPToken()).resolves.toBeDefined();
  });
});
