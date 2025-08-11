#import <Foundation/Foundation.h>
#import <PushKit/PushKit.h>
#import <CallKit/CallKit.h>

@interface CallxPushKitHandler : NSObject <PKPushRegistryDelegate, CXProviderDelegate>

// CallKit properties
@property (nonatomic, strong) CXProvider *provider;
@property (nonatomic, strong) CXCallController *callController;
@property (nonatomic, strong) NSUUID *currentCallUUID;
@property (nonatomic, strong) NSDictionary *currentCallData;
@property (nonatomic, assign) BOOL hasAnswered;

// PushKit properties
@property (nonatomic, strong) PKPushRegistry *pushRegistry;
@property (nonatomic, strong) NSString *voipToken;

// Configuration
@property (nonatomic, strong) NSDictionary *configuration;

// Initialize
+ (instancetype)sharedInstance;
- (void)setupPushKit;
- (void)loadConfiguration;

// Call management (iOS Policy Compliant)
- (void)handleIncomingCallImmediately:(NSDictionary *)callData;
- (void)endCallImmediately:(NSString *)callId;
- (void)answerCall:(NSString *)callId;
- (void)declineCall:(NSString *)callId;

// Legacy methods (for JS interface compatibility)
- (void)handleIncomingCall:(NSDictionary *)callData;
- (void)endCall:(NSString *)callId;

// Data parsing
- (NSDictionary *)parseCallDataFromPush:(NSDictionary *)pushData;
- (NSString *)getFieldValue:(NSDictionary *)data fieldConfig:(NSDictionary *)fieldConfig;
- (NSString *)detectTriggerType:(NSDictionary *)data;

@end 