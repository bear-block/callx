#import "Callx.h"
#import "CallxPushKitHandler.h"
#import <React/RCTLog.h>
#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

@implementation Callx

RCT_EXPORT_MODULE()

- (instancetype)init {
    self = [super init];
    if (self) {
        // Initialize native PushKit handler for automatic call processing
        CallxPushKitHandler *nativeHandler = [CallxPushKitHandler sharedInstance];
        
        // Use the native handler's provider and call controller to avoid conflicts
        self.provider = nativeHandler.provider;
        self.callController = nativeHandler.callController;
        self.pushRegistry = nativeHandler.pushRegistry;
        self.configuration = nativeHandler.configuration;
        
        // Setup for JS interface compatibility (but don't create new providers)
        [self loadConfiguration];
    }
    return self;
}

#pragma mark - CallKit Setup

- (void)setupCallKit {
    [self setupCallKitWithVideoSupport:NO];
}

- (void)setupCallKitWithVideoSupport:(BOOL)supportsVideo {
    // Create CallKit provider configuration
    CXProviderConfiguration *providerConfig = [[CXProviderConfiguration alloc] initWithLocalizedName:@"Callx"];
    providerConfig.supportsVideo = supportsVideo;
    providerConfig.maximumCallGroups = 1;
    providerConfig.maximumCallsPerCallGroup = 1;
    providerConfig.supportedHandleTypes = [NSSet setWithArray:@[@(CXHandleTypeGeneric)]];
    providerConfig.iconTemplateImageData = UIImagePNGRepresentation([UIImage systemImageNamed:@"phone.fill"]);
    providerConfig.ringtoneSound = @"default";
    
    self.provider = [[CXProvider alloc] initWithConfiguration:providerConfig];
    [self.provider setDelegate:self queue:nil];
    
    self.callController = [[CXCallController alloc] init];
    
    RCTLogInfo(@"Callx: CallKit setup completed with video support: %@", supportsVideo ? @"YES" : @"NO");
}

#pragma mark - PushKit Setup

- (void)setupPushKit {
    self.pushRegistry = [[PKPushRegistry alloc] initWithQueue:dispatch_get_main_queue()];
    self.pushRegistry.delegate = self;
    self.pushRegistry.desiredPushTypes = [NSSet setWithObject:PKPushTypeVoIP];
    
    RCTLogInfo(@"Callx: PushKit setup completed");
}

#pragma mark - Configuration

- (void)loadConfiguration {
    NSString *configPath = [[NSBundle mainBundle] pathForResource:@"callx" ofType:@"json"];
    if (configPath) {
        NSData *configData = [NSData dataWithContentsOfFile:configPath];
        if (configData) {
            NSError *error;
            self.configuration = [NSJSONSerialization JSONObjectWithData:configData options:0 error:&error];
            if (error) {
                RCTLogError(@"Callx: Failed to parse configuration: %@", error.localizedDescription);
            } else {
                RCTLogInfo(@"Callx: Configuration loaded successfully");
            }
        }
    } else {
        RCTLogWarn(@"Callx: No callx.json found, using default configuration");
        // Set default configuration
        self.configuration = @{
            @"triggers": @{
                @"incoming": @{@"field": @"type", @"value": @"call.started"},
                @"ended": @{@"field": @"type", @"value": @"call.ended"},
                @"missed": @{@"field": @"type", @"value": @"call.missed"},
                @"answered_elsewhere": @{@"field": @"type", @"value": @"call.answered_elsewhere"}
            },
            @"fields": @{
                @"callId": @{@"field": @"callId"},
                @"callerName": @{@"field": @"callerName", @"fallback": @"Unknown Caller"},
                @"callerPhone": @{@"field": @"callerPhone", @"fallback": @"No Number"},
                @"callerAvatar": @{@"field": @"callerAvatar", @"fallback": @""},
                @"hasVideo": @{@"field": @"hasVideo", @"fallback": @NO}
            },

            @"enabledLogPhoneCall": @YES
        };
    }
}

#pragma mark - Native Methods Implementation

RCT_EXPORT_METHOD(initialize:(NSDictionary *)config
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    @try {
        // Update configuration if provided
        if (config) {
            NSMutableDictionary *newConfig = [self.configuration mutableCopy];
            [newConfig addEntriesFromDictionary:config];
            self.configuration = newConfig;
        }
        
        RCTLogInfo(@"Callx: Initialized with configuration");
        resolve(@YES);
    } @catch (NSException *exception) {
        reject(@"INITIALIZATION_ERROR", exception.reason, nil);
    }
}

RCT_EXPORT_METHOD(showIncomingCall:(NSDictionary *)callData
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    @try {
        [self handleIncomingCall:callData];
        resolve(@YES);
    } @catch (NSException *exception) {
        reject(@"SHOW_CALL_ERROR", exception.reason, nil);
    }
}

RCT_EXPORT_METHOD(endCall:(NSString *)callId
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    @try {
        [self endCall:callId];
        resolve(@YES);
    } @catch (NSException *exception) {
        reject(@"END_CALL_ERROR", exception.reason, nil);
    }
}

RCT_EXPORT_METHOD(answerCall:(NSString *)callId
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    @try {
        [self answerCall:callId];
        resolve(@YES);
    } @catch (NSException *exception) {
        reject(@"ANSWER_CALL_ERROR", exception.reason, nil);
    }
}

RCT_EXPORT_METHOD(declineCall:(NSString *)callId
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    @try {
        [self declineCall:callId];
        resolve(@YES);
    } @catch (NSException *exception) {
        reject(@"DECLINE_CALL_ERROR", exception.reason, nil);
    }
}

RCT_EXPORT_METHOD(handleFcmMessage:(NSDictionary *)data
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    @try {
        NSDictionary *callData = [self parseCallDataFromPush:data];
        if (callData) {
            NSString *triggerType = [self detectTriggerType:data];
            
            if ([triggerType isEqualToString:@"incoming"]) {
                [self handleIncomingCall:callData];
            } else if ([triggerType isEqualToString:@"ended"]) {
                [self endCall:callData[@"callId"]];
            } else if ([triggerType isEqualToString:@"missed"]) {
                [self endCall:callData[@"callId"]];
            } else if ([triggerType isEqualToString:@"answered_elsewhere"]) {
                [self handleCallAnsweredElsewhere:callData];
            }
        }
        resolve(@YES);
    } @catch (NSException *exception) {
        reject(@"FCM_HANDLE_ERROR", exception.reason, nil);
    }
}

RCT_EXPORT_METHOD(getFCMToken:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    // For iOS, return VoIP token instead of FCM token
    NSString *token = [self getVoIPToken];
    if (token) {
        resolve(token);
    } else {
        reject(@"FCM_TOKEN_ERROR", @"VoIP token not available", nil);
    }
}

RCT_EXPORT_METHOD(getVoIPToken:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    NSString *token = [self getVoIPToken];
    if (token) {
        resolve(token);
    } else {
        reject(@"VOIP_TOKEN_ERROR", @"VoIP token not available", nil);
    }
}

RCT_EXPORT_METHOD(setFieldMapping:(NSString *)field
                  path:(NSString *)path
                  fallback:(NSString *)fallback
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    @try {
        NSMutableDictionary *fields = [self.configuration[@"fields"] mutableCopy];
        fields[field] = @{@"field": path, @"fallback": fallback ?: [NSNull null]};
        
        NSMutableDictionary *newConfig = [self.configuration mutableCopy];
        newConfig[@"fields"] = fields;
        self.configuration = newConfig;
        
        resolve(@YES);
    } @catch (NSException *exception) {
        reject(@"SET_FIELD_ERROR", exception.reason, nil);
    }
}

RCT_EXPORT_METHOD(setTrigger:(NSString *)trigger
                  field:(NSString *)field
                  value:(NSString *)value
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    @try {
        NSMutableDictionary *triggers = [self.configuration[@"triggers"] mutableCopy];
        triggers[trigger] = @{@"field": field, @"value": value};
        
        NSMutableDictionary *newConfig = [self.configuration mutableCopy];
        newConfig[@"triggers"] = triggers;
        self.configuration = newConfig;
        
        resolve(@YES);
    } @catch (NSException *exception) {
        reject(@"SET_TRIGGER_ERROR", exception.reason, nil);
    }
}

RCT_EXPORT_METHOD(getCurrentCall:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    resolve(self.currentCallData ?: [NSNull null]);
}

RCT_EXPORT_METHOD(isCallActive:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    resolve(@(self.currentCallData != nil));
}

RCT_EXPORT_METHOD(hideFromLockScreen:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    // iOS handles this automatically through CallKit
    resolve(@YES);
}

RCT_EXPORT_METHOD(moveAppToBackground:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    // iOS handles this automatically through CallKit
    resolve(@YES);
}

















RCT_EXPORT_METHOD(getConfiguration:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    if (self.configuration) {
        resolve(self.configuration);
    } else {
        reject(@"CONFIG_NOT_FOUND", @"Configuration not loaded", nil);
    }
}

#pragma mark - Call Management

- (void)handleIncomingCall:(NSDictionary *)callData {
    self.currentCallData = [NSMutableDictionary dictionaryWithDictionary:callData];
    self.currentCallUUID = [NSUUID UUID];
    
    // Check if this is a video call and setup CallKit accordingly
    BOOL hasVideo = NO;
    if (callData[@"hasVideo"]) {
        hasVideo = [callData[@"hasVideo"] boolValue];
    }
    
    // Setup CallKit with appropriate video support
    [self setupCallKitWithVideoSupport:hasVideo];
    
    CXCallUpdate *update = [[CXCallUpdate alloc] init];
    update.remoteHandle = [[CXHandle alloc] initWithType:CXHandleTypeGeneric value:callData[@"callerPhone"]];
    update.localizedCallerName = callData[@"callerName"];
    update.hasVideo = hasVideo;
    
    [self.provider reportNewIncomingCallWithUUID:self.currentCallUUID
                                          update:update
                                      completion:^(NSError * _Nullable error) {
        if (error) {
            RCTLogError(@"Callx: Failed to report incoming call: %@", error.localizedDescription);
        } else {
            RCTLogInfo(@"Callx: Incoming call reported successfully");
            RCTLogInfo(@"Callx: Video call: %@", hasVideo ? @"YES" : @"NO");
            // Send event to JS
            [self sendEventWithName:@"onIncomingCall" body:callData];
        }
    }];
}

- (void)endCall:(NSString *)callId {
    if (self.currentCallUUID) {
        CXEndCallAction *endAction = [[CXEndCallAction alloc] initWithCallUUID:self.currentCallUUID];
        CXTransaction *transaction = [[CXTransaction alloc] initWithAction:endAction];
        
        [self.callController requestTransaction:transaction completion:^(NSError * _Nullable error) {
            if (error) {
                RCTLogError(@"Callx: Failed to end call: %@", error.localizedDescription);
            } else {
                RCTLogInfo(@"Callx: Call ended successfully");
                self.currentCallData = nil;
                self.currentCallUUID = nil;
                [self sendEventWithName:@"onCallEnded" body:@{@"callId": callId ?: @""}];
            }
        }];
    }
}

- (void)answerCall:(NSString *)callId {
    if (self.currentCallUUID) {
        CXAnswerCallAction *answerAction = [[CXAnswerCallAction alloc] initWithCallUUID:self.currentCallUUID];
        CXTransaction *transaction = [[CXTransaction alloc] initWithAction:answerAction];
        
        [self.callController requestTransaction:transaction completion:^(NSError * _Nullable error) {
            if (error) {
                RCTLogError(@"Callx: Failed to answer call: %@", error.localizedDescription);
            } else {
                RCTLogInfo(@"Callx: Call answered successfully");
                [self sendEventWithName:@"onCallAnswered" body:self.currentCallData];
                RCTLogInfo(@"Callx: Call answered - %@", callId);
            }
        }];
    }
}

- (void)declineCall:(NSString *)callId {
    if (self.currentCallUUID) {
        CXEndCallAction *endAction = [[CXEndCallAction alloc] initWithCallUUID:self.currentCallUUID];
        CXTransaction *transaction = [[CXTransaction alloc] initWithAction:endAction];
        
        [self.callController requestTransaction:transaction completion:^(NSError * _Nullable error) {
            if (error) {
                RCTLogError(@"Callx: Failed to decline call: %@", error.localizedDescription);
            } else {
                RCTLogInfo(@"Callx: Call declined successfully");
                // Send event to JS
                [self sendEventWithName:@"onCallDeclined" body:self.currentCallData];
                RCTLogInfo(@"Callx: Call declined - %@", callId);
                
                // Clear call data
                self.currentCallData = nil;
                self.currentCallUUID = nil;
            }
        }];
    }
}

- (void)handleCallAnsweredElsewhere:(NSDictionary *)callData {
    if (self.currentCallUUID) {
        // End the current call since it was answered elsewhere
        [self endCall:callData[@"callId"]];
        
        // Send event to JS
        [self sendEventWithName:@"onCallAnsweredElsewhere" body:callData];
        RCTLogInfo(@"Callx: Call answered elsewhere - %@", callData[@"callId"]);
    }
}

#pragma mark - Data Parsing

- (NSDictionary *)parseCallDataFromPush:(NSDictionary *)pushData {
    NSDictionary *fields = self.configuration[@"fields"];
    
    NSString *callId = [self getFieldValue:pushData fieldConfig:fields[@"callId"]];
    NSString *callerName = [self getFieldValue:pushData fieldConfig:fields[@"callerName"]];
    NSString *callerPhone = [self getFieldValue:pushData fieldConfig:fields[@"callerPhone"]];
    NSString *callerAvatar = [self getFieldValue:pushData fieldConfig:fields[@"callerAvatar"]];
    
    if (!callId) {
        callId = [[NSUUID UUID] UUIDString];
    }
    
    return @{
        @"callId": callId,
        @"callerName": callerName ?: @"Unknown Caller",
        @"callerPhone": callerPhone ?: @"No Number",
        @"callerAvatar": callerAvatar ?: @"",
        @"timestamp": @([[NSDate date] timeIntervalSince1970] * 1000)
    };
}

- (NSString *)getFieldValue:(NSDictionary *)data fieldConfig:(NSDictionary *)fieldConfig {
    NSString *fieldPath = fieldConfig[@"field"];
    NSString *fallback = fieldConfig[@"fallback"];
    
    if (!fieldPath) return fallback;
    
    NSArray *pathComponents = [fieldPath componentsSeparatedByString:@"."];
    id current = data;
    
    for (NSString *component in pathComponents) {
        if ([current isKindOfClass:[NSDictionary class]]) {
            current = current[component];
        } else {
            return fallback;
        }
    }
    
    return [current isKindOfClass:[NSString class]] ? current : fallback;
}

- (NSString *)detectTriggerType:(NSDictionary *)data {
    NSDictionary *triggers = self.configuration[@"triggers"];
    
    for (NSString *triggerName in triggers) {
        NSDictionary *triggerConfig = triggers[triggerName];
        NSString *field = triggerConfig[@"field"];
        NSString *value = triggerConfig[@"value"];
        
        NSString *actualValue = [self getFieldValue:data fieldConfig:@{@"field": field}];
        if ([actualValue isEqualToString:value]) {
            return triggerName;
        }
    }
    
    return nil;
}

#pragma mark - Event Emitter

- (NSArray<NSString *> *)supportedEvents {
    return @[@"onIncomingCall", @"onCallAnswered", @"onCallDeclined", @"onCallEnded", @"onCallMissed", @"onCallAnsweredElsewhere", @"onTokenUpdated"];
}

- (void)sendEventWithName:(NSString *)name body:(id)body {
    [super sendEventWithName:name body:body];
}

#pragma mark - Token Management

- (NSString *)getVoIPToken {
    return self.voipToken;
}

#pragma mark - CXProviderDelegate

- (void)providerDidReset:(CXProvider *)provider {
    RCTLogInfo(@"Callx: CallKit provider did reset");
    self.currentCallData = nil;
    self.currentCallUUID = nil;
}

- (void)provider:(CXProvider *)provider performStartCallAction:(CXStartCallAction *)action {
    RCTLogInfo(@"Callx: Start call action performed");
    [action fulfill];
}

- (void)provider:(CXProvider *)provider performAnswerCallAction:(CXAnswerCallAction *)action {
    RCTLogInfo(@"Callx: Answer call action performed");
    [self answerCall:self.currentCallData[@"callId"]];
    [action fulfill];
}

- (void)provider:(CXProvider *)provider performEndCallAction:(CXEndCallAction *)action {
    RCTLogInfo(@"Callx: End call action performed");
    [self endCall:self.currentCallData[@"callId"]];
    [action fulfill];
}

- (void)provider:(CXProvider *)provider performSetHeldCallAction:(CXSetHeldCallAction *)action {
    [action fulfill];
}

- (void)provider:(CXProvider *)provider performSetMutedCallAction:(CXSetMutedCallAction *)action {
    [action fulfill];
}

#pragma mark - PKPushRegistryDelegate

- (void)pushRegistry:(PKPushRegistry *)registry didReceiveIncomingPushWithPayload:(PKPushPayload *)payload forType:(PKPushType)type withCompletionHandler:(void (^)(void))completion {
    if ([type isEqualToString:PKPushTypeVoIP]) {
        RCTLogInfo(@"Callx: Received VoIP push notification");
        
        NSDictionary *callData = [self parseCallDataFromPush:payload.dictionaryPayload];
        if (callData) {
            NSString *triggerType = [self detectTriggerType:payload.dictionaryPayload];
            
            if ([triggerType isEqualToString:@"incoming"]) {
                [self handleIncomingCall:callData];
            }
        }
    }
    
    completion();
}

- (void)pushRegistry:(PKPushRegistry *)registry didUpdatePushCredentials:(PKPushCredentials *)pushCredentials forType:(PKPushType)type {
    if ([type isEqualToString:PKPushTypeVoIP]) {
        // Convert token data to string
        NSString *token = [pushCredentials.token description];
        token = [token stringByTrimmingCharactersInSet:[NSCharacterSet characterSetWithCharactersInString:@"<>"]];
        token = [token stringByReplacingOccurrencesOfString:@" " withString:@""];
        
        self.voipToken = token;
        RCTLogInfo(@"Callx: VoIP push credentials updated: %@", token);
        
        // Send event to JS with new VoIP token
        [self sendEventWithName:@"onTokenUpdated" body:@{@"token": token}];
    }
}

#pragma mark - TurboModule

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
    return std::make_shared<facebook::react::NativeCallxSpecJSI>(params);
}

@end
