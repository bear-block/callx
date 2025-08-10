#import <CallxSpec/CallxSpec.h>
#import <CallKit/CallKit.h>
#import <PushKit/PushKit.h>
#import <Foundation/Foundation.h>
#import <React/RCTEventEmitter.h>

@interface Callx : RCTEventEmitter <NativeCallxSpec, CXProviderDelegate, PKPushRegistryDelegate>

// CallKit properties
@property (nonatomic, strong) CXProvider *provider;
@property (nonatomic, strong) CXCallController *callController;
@property (nonatomic, strong) NSUUID *currentCallUUID;

// PushKit properties  
@property (nonatomic, strong) PKPushRegistry *pushRegistry;
@property (nonatomic, strong) NSString *voipToken;

// Call data
@property (nonatomic, strong) NSMutableDictionary *currentCallData;

// Configuration
@property (nonatomic, strong) NSDictionary *configuration;

// Call management
- (void)handleIncomingCall:(NSDictionary *)callData;
- (void)endCall:(NSString *)callId;
- (void)answerCall:(NSString *)callId;
- (void)declineCall:(NSString *)callId;

// Configuration
- (void)loadConfiguration;
- (NSDictionary *)parseCallDataFromPush:(NSDictionary *)pushData;

// Token management
- (NSString *)getVoIPToken;

@end
