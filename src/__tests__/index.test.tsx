import CallxInstance from '../index';

// Mock the native module
jest.mock('../NativeCallx', () => ({
  __esModule: true,
  default: {
    initialize: jest.fn().mockResolvedValue(undefined),

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
