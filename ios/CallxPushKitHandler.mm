#import "CallxPushKitHandler.h"
#import <React/RCTLog.h>
#import <UIKit/UIKit.h>
#import <CallKit/CallKit.h>

@implementation CallxPushKitHandler

+ (instancetype)sharedInstance {
    static CallxPushKitHandler *sharedInstance = nil;
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        sharedInstance = [[self alloc] init];
    });
    return sharedInstance;
}

- (instancetype)init {
    self = [super init];
    if (self) {
        [self setupCallKit];
        [self setupPushKit];
        [self loadConfiguration];
    }
    return self;
}

#pragma mark - CallKit Setup

- (void)setupCallKit {
    // Create CallKit provider configuration
    CXProviderConfiguration *providerConfig = [[CXProviderConfiguration alloc] initWithLocalizedName:@"Callx"];
    
    // Check video support configuration
    NSDictionary *appConfig = self.configuration[@"app"];
    BOOL supportsVideo = appConfig ? [appConfig[@"supportsVideo"] boolValue] : NO;
    providerConfig.supportsVideo = supportsVideo;
    
    providerConfig.maximumCallGroups = 1;
    providerConfig.maximumCallsPerCallGroup = 1;
    providerConfig.supportedHandleTypes = [NSSet setWithArray:@[@(CXHandleTypeGeneric)]];
    
    // Note: supportsDTMF, supportsHolding, etc. are deprecated in modern CallKit
    // These capabilities are now enabled by default and don't need explicit configuration
    
    // Use a simple icon instead of system image to avoid potential issues
    UIImage *phoneIcon = [UIImage systemImageNamed:@"phone.fill"];
    if (phoneIcon) {
        providerConfig.iconTemplateImageData = UIImagePNGRepresentation(phoneIcon);
    }
    
    providerConfig.ringtoneSound = @"default";
    
    // Check if call logging is enabled (from app config)
    NSDictionary *appCfg = self.configuration[@"app"];
    BOOL callLoggingEnabled = appCfg && appCfg[@"enabledLogPhoneCall"] ? [appCfg[@"enabledLogPhoneCall"] boolValue] : YES;
    
    // Configure provider based on call logging setting
    providerConfig.includesCallsInRecents = callLoggingEnabled;
    
    self.provider = [[CXProvider alloc] initWithConfiguration:providerConfig];
    [self.provider setDelegate:self queue:nil];
    
    self.callController = [[CXCallController alloc] init];
    
    if (callLoggingEnabled) {
        RCTLogInfo(@"CallxPushKitHandler: CallKit setup completed with call history enabled");
    } else {
        RCTLogInfo(@"CallxPushKitHandler: CallKit setup completed with call history disabled");
    }
    
    if (supportsVideo) {
        RCTLogInfo(@"CallxPushKitHandler: Video calls supported");
    } else {
        RCTLogInfo(@"CallxPushKitHandler: Voice calls only");
    }
}

#pragma mark - PushKit Setup

- (void)setupPushKit {
    self.pushRegistry = [[PKPushRegistry alloc] initWithQueue:dispatch_get_main_queue()];
    self.pushRegistry.delegate = self;
    self.pushRegistry.desiredPushTypes = [NSSet setWithObject:PKPushTypeVoIP];
    
    RCTLogInfo(@"CallxPushKitHandler: PushKit setup completed");
}

#pragma mark - Configuration

- (void)loadConfiguration {
    // Load mapping from Info.plist (injected by plugin)
    NSBundle *bundle = [NSBundle mainBundle];
    NSDictionary *triggers = [bundle objectForInfoDictionaryKey:@"CallxTriggers"];
    NSDictionary *fields = [bundle objectForInfoDictionaryKey:@"CallxFields"];
    NSDictionary *app = [bundle objectForInfoDictionaryKey:@"CallxApp"];
    if (triggers || fields || app) {
        NSMutableDictionary *cfg = [NSMutableDictionary dictionary];
        if (triggers) cfg[@"triggers"] = triggers;
        if (fields) cfg[@"fields"] = fields;
        // App config (supportsVideo, enabledLogPhoneCall)
        BOOL supportsVideo = NO;
        BOOL enabledLogPhoneCall = YES;
        if (app && [app isKindOfClass:[NSDictionary class]]) {
            id sv = app[@"supportsVideo"]; if (sv) supportsVideo = [sv boolValue];
            id el = app[@"enabledLogPhoneCall"]; if (el) enabledLogPhoneCall = [el boolValue];
        }
        cfg[@"app"] = @{ @"supportsVideo": @(supportsVideo), @"enabledLogPhoneCall": @(enabledLogPhoneCall) };
        self.configuration = cfg;
        RCTLogInfo(@"CallxPushKitHandler: ✅ Configuration loaded from Info.plist");
        return;
    }
    [self setDefaultConfiguration];
}

- (void)validateConfiguration:(NSDictionary *)config {
    NSMutableArray *errors = [NSMutableArray array];
    
    // Check required triggers
    NSArray *requiredTriggers = @[@"incoming", @"ended", @"missed"];
    NSDictionary *triggers = config[@"triggers"];
    for (NSString *trigger in requiredTriggers) {
        if (!triggers[trigger]) {
            [errors addObject:[NSString stringWithFormat:@"Missing required trigger: %@", trigger]];
        }
    }
    
    // Check required fields
    NSArray *requiredFields = @[@"callId", @"callerName", @"callerPhone"];
    NSDictionary *fields = config[@"fields"];
    for (NSString *field in requiredFields) {
        if (!fields[field]) {
            [errors addObject:[NSString stringWithFormat:@"Missing required field: %@", field]];
        }
    }
    
    
    
    if (errors.count > 0) {
        RCTLogWarn(@"CallxPushKitHandler: ⚠️ Configuration validation warnings:");
        for (NSString *error in errors) {
            RCTLogWarn(@"CallxPushKitHandler:    - %@", error);
        }
    }
}

- (void)setDefaultConfiguration {
    self.configuration = @{
        @"triggers": @{
            @"incoming": @{@"field": @"type", @"value": @"call.started"},
            @"ended": @{@"field": @"type", @"value": @"call.ended"},
            @"missed": @{@"field": @"type", @"value": @"call.missed"}
        },
        @"fields": @{
            @"callId": @{@"field": @"callId"},
            @"callerName": @{@"field": @"callerName", @"fallback": @"Unknown Caller"},
            @"callerPhone": @{@"field": @"callerPhone", @"fallback": @"No Number"},
            @"callerAvatar": @{@"field": @"callerAvatar", @"fallback": @""}
        },
        @"app": @{
            @"supportsVideo": @NO,
            @"enabledLogPhoneCall": @YES
        }
    };
    RCTLogInfo(@"CallxPushKitHandler: 📋 Using default configuration");
}

#pragma mark - Call Management (iOS Policy Compliant)

- (void)handleIncomingCallImmediately:(NSDictionary *)callData {
    if (!callData) {
        RCTLogError(@"CallxPushKitHandler: Cannot handle incoming call - no call data");
        return;
    }
    
    // Generate UUID immediately
    self.currentCallUUID = [NSUUID UUID];
    self.currentCallData = callData;
    self.hasAnswered = NO;
    
    // Parse video setting from call data
    BOOL hasVideo = NO;
    if (callData[@"hasVideo"]) {
        hasVideo = [callData[@"hasVideo"] boolValue];
    }
    
    // Create CallKit update immediately
    CXCallUpdate *update = [[CXCallUpdate alloc] init];
    // Normalize E.164 number for display if needed
    NSString *rawNumber = callData[@"callerPhone"] ?: @"";
    NSString *displayNumber = rawNumber.length > 0 ? rawNumber : @"Unknown";
    update.remoteHandle = [[CXHandle alloc] initWithType:CXHandleTypePhoneNumber value:displayNumber];
    update.localizedCallerName = callData[@"callerName"] ?: @"Unknown Caller";
    update.hasVideo = hasVideo;
    
    // Report to CallKit IMMEDIATELY (synchronous)
    [self.provider reportNewIncomingCallWithUUID:self.currentCallUUID
                                          update:update
                                      completion:^(NSError * _Nullable error) {
        if (error) {
            RCTLogError(@"CallxPushKitHandler: Failed to report incoming call: %@", error.localizedDescription);
        } else {
            RCTLogInfo(@"CallxPushKitHandler: Incoming call reported successfully");
            RCTLogInfo(@"CallxPushKitHandler: Call data: %@", callData);
            RCTLogInfo(@"CallxPushKitHandler: Video call: %@", hasVideo ? @"YES" : @"NO");
            // Emit incoming event to JS for parity with Android
            [[NSNotificationCenter defaultCenter] postNotificationName:@"CallxEvent" object:nil userInfo:@{ @"event": @"onIncomingCall", @"data": self.currentCallData ?: @{} }];
        }
    }];
}

- (void)endCallImmediately:(NSString *)callId {
    if (!self.currentCallUUID) {
        RCTLogWarn(@"CallxPushKitHandler: No active call to end");
        return;
    }
    
    // End call immediately (synchronous)
    CXEndCallAction *endAction = [[CXEndCallAction alloc] initWithCallUUID:self.currentCallUUID];
    CXTransaction *transaction = [[CXTransaction alloc] initWithAction:endAction];
    
    [self.callController requestTransaction:transaction completion:^(NSError * _Nullable error) {
        if (error) {
            RCTLogError(@"CallxPushKitHandler: Failed to end call: %@", error.localizedDescription);
        } else {
            RCTLogInfo(@"CallxPushKitHandler: Call ended successfully");
            self.currentCallUUID = nil;
        }
    }];
}

// Handle call answered elsewhere (desktop, web, other device)
- (void)handleCallAnsweredElsewhere:(NSDictionary *)callData {
    RCTLogInfo(@"CallxPushKitHandler: Call answered elsewhere - %@", callData[@"callId"]);
    
    // End current call if exists
    if (self.currentCallUUID) {
        [self endCallImmediately:callData[@"callId"]];
    }
    // Notify JS and buffer pending action
    [[NSNotificationCenter defaultCenter] postNotificationName:@"CallxEvent" object:nil userInfo:@{ @"event": @"onCallAnsweredElsewhere", @"data": callData ?: @{} }];
    NSUserDefaults *defaults = [NSUserDefaults standardUserDefaults];
    [defaults setObject:@{ @"action": @"answered_elsewhere", @"data": callData ?: @{} } forKey:@"callx_pending_action"];
    [defaults synchronize];
}

- (void)answerCall:(NSString *)callId {
    if (!self.currentCallUUID) {
        RCTLogWarn(@"CallxPushKitHandler: No active call to answer");
        return;
    }
    
    // First, answer the call (this will transition CallKit to connected state)
    CXAnswerCallAction *answerAction = [[CXAnswerCallAction alloc] initWithCallUUID:self.currentCallUUID];
    CXTransaction *transaction = [[CXTransaction alloc] initWithAction:answerAction];
    
    [self.callController requestTransaction:transaction completion:^(NSError * _Nullable error) {
        if (error) {
            RCTLogError(@"CallxPushKitHandler: Failed to answer call: %@", error.localizedDescription);
        } else {
            RCTLogInfo(@"CallxPushKitHandler: Call answered successfully");
            
            // Update CallKit UI to show call is connected
            CXCallUpdate *update = [[CXCallUpdate alloc] init];
            // Note: hasConnected and hasEnded are deprecated properties
            // CallKit automatically manages call state based on actions
            
            [self.provider reportCallWithUUID:self.currentCallUUID updated:update];
            
            // Note: CallKit UI will now show the connected call interface
            // The incoming call UI will be replaced by the active call UI
            RCTLogInfo(@"CallxPushKitHandler: CallKit UI updated to connected state");
            self.hasAnswered = YES;
            // Emit answered to JS (Android parity)
            [[NSNotificationCenter defaultCenter] postNotificationName:@"CallxEvent" object:nil userInfo:@{ @"event": @"onCallAnswered", @"data": self.currentCallData ?: @{} }];
            // Buffer pending action in case JS not ready
            NSUserDefaults *defaults = [NSUserDefaults standardUserDefaults];
            [defaults setObject:@{ @"action": @"answer", @"data": self.currentCallData ?: @{} } forKey:@"callx_pending_action"];
            [defaults synchronize];
        }
    }];
}

- (void)declineCall:(NSString *)callId {
    if (!self.currentCallUUID) {
        RCTLogWarn(@"CallxPushKitHandler: No active call to decline");
        return;
    }
    
    // Decline by ending the call immediately
    CXEndCallAction *endAction = [[CXEndCallAction alloc] initWithCallUUID:self.currentCallUUID];
    CXTransaction *transaction = [[CXTransaction alloc] initWithAction:endAction];
    
    [self.callController requestTransaction:transaction completion:^(NSError * _Nullable error) {
        if (error) {
            RCTLogError(@"CallxPushKitHandler: Failed to decline call: %@", error.localizedDescription);
        } else {
            RCTLogInfo(@"CallxPushKitHandler: Call declined successfully");
            self.currentCallUUID = nil;
            // Emit declined to JS (Android parity)
            [[NSNotificationCenter defaultCenter] postNotificationName:@"CallxEvent" object:nil userInfo:@{ @"event": @"onCallDeclined", @"data": self.currentCallData ?: @{} }];
            // Buffer pending action in case JS not ready
            NSUserDefaults *defaults = [NSUserDefaults standardUserDefaults];
            [defaults setObject:@{ @"action": @"decline", @"data": self.currentCallData ?: @{} } forKey:@"callx_pending_action"];
            [defaults synchronize];
        }
    }];
}

#pragma mark - Legacy Methods (for JS interface compatibility)

- (void)handleIncomingCall:(NSDictionary *)callData {
    [self handleIncomingCallImmediately:callData];
}

- (void)endCall:(NSString *)callId {
    [self endCallImmediately:callId];
}

#pragma mark - Data Parsing (Equivalent to Android)

- (NSDictionary *)parseCallDataFromPush:(NSDictionary *)pushData {
    if (!pushData || !self.configuration) {
        RCTLogError(@"CallxPushKitHandler: Cannot parse call data - missing push data or configuration");
        return nil;
    }
    
    RCTLogInfo(@"CallxPushKitHandler: Processing push data");
    
    NSDictionary *fields = self.configuration[@"fields"];
    if (!fields) {
        RCTLogError(@"CallxPushKitHandler: No fields configuration found");
        return nil;
    }
    
    NSString *callId = [self getFieldValue:pushData fieldConfig:fields[@"callId"]];
    NSString *callerName = [self getFieldValue:pushData fieldConfig:fields[@"callerName"]];
    NSString *callerPhone = [self getFieldValue:pushData fieldConfig:fields[@"callerPhone"]];
    NSString *callerAvatar = [self getFieldValue:pushData fieldConfig:fields[@"callerAvatar"]];
    NSString *hasVideo = [self getFieldValue:pushData fieldConfig:fields[@"hasVideo"]];
    
    if (!callId) {
        callId = [[NSUUID UUID] UUIDString];
    }
    
    // Parse video setting
    BOOL hasVideoBool = NO;
    if (hasVideo) {
        hasVideoBool = [hasVideo boolValue];
    }
    
    NSDictionary *callData = @{
        @"callId": callId ?: @"",
        @"callerName": callerName ?: @"Unknown Caller",
        @"callerPhone": callerPhone ?: @"No Number",
        @"callerAvatar": callerAvatar ?: @"",
        @"hasVideo": @(hasVideoBool),
        @"timestamp": @([[NSDate date] timeIntervalSince1970] * 1000)
    };
    
    RCTLogInfo(@"CallxPushKitHandler: Extracted call data: %@", callData);
    return callData;
}

- (NSString *)getFieldValue:(NSDictionary *)data fieldConfig:(NSDictionary *)fieldConfig {
    if (!data || !fieldConfig) {
        return nil;
    }
    
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
    if (!data || !self.configuration) {
        return nil;
    }
    
    NSDictionary *triggers = self.configuration[@"triggers"];
    if (!triggers) {
        return nil;
    }
    
    for (NSString *triggerName in triggers) {
        NSDictionary *triggerConfig = triggers[triggerName];
        NSString *field = triggerConfig[@"field"];
        NSString *value = triggerConfig[@"value"];
        
        if (!field || !value) continue;
        
        NSString *actualValue = [self getFieldValue:data fieldConfig:@{@"field": field}];
        if ([actualValue isEqualToString:value]) {
            RCTLogInfo(@"CallxPushKitHandler: Detected trigger: %@", triggerName);
            return triggerName;
        }
    }
    
    return nil;
}

#pragma mark - PKPushRegistryDelegate

- (void)pushRegistry:(PKPushRegistry *)registry didReceiveIncomingPushWithPayload:(PKPushPayload *)payload forType:(PKPushType)type withCompletionHandler:(void (^)(void))completion {
    if ([type isEqualToString:PKPushTypeVoIP]) {
        RCTLogInfo(@"CallxPushKitHandler: Received VoIP push notification");
        RCTLogInfo(@"CallxPushKitHandler: Payload: %@", payload.dictionaryPayload);
        
        // CRITICAL: Must complete within 30 seconds and show CallKit immediately
        // Parse data synchronously (no async operations)
        NSDictionary *callData = [self parseCallDataFromPush:payload.dictionaryPayload];
        NSString *triggerType = [self detectTriggerType:payload.dictionaryPayload];
        
        if ([triggerType isEqualToString:@"incoming"] && callData) {
            RCTLogInfo(@"CallxPushKitHandler: Processing incoming call - SHOWING CALLKIT IMMEDIATELY");
            
            // Show CallKit UI immediately (synchronous)
            [self handleIncomingCallImmediately:callData];
            
            // Complete the push notification
            if (completion) {
                completion();
            }
        } else if ([triggerType isEqualToString:@"ended"]) {
            RCTLogInfo(@"CallxPushKitHandler: Processing call ended");
            [self endCallImmediately:callData[@"callId"]];
            [[NSNotificationCenter defaultCenter] postNotificationName:@"CallxEvent" object:nil userInfo:@{ @"event": @"onCallEnded", @"data": callData ?: @{} }];
            NSUserDefaults *defaults = [NSUserDefaults standardUserDefaults];
            [defaults setObject:@{ @"action": @"ended", @"data": callData ?: @{} } forKey:@"callx_pending_action"];
            [defaults synchronize];
            if (completion) { completion(); }
        } else if ([triggerType isEqualToString:@"missed"]) {
            RCTLogInfo(@"CallxPushKitHandler: Processing call missed");
            [self endCallImmediately:callData[@"callId"]];
            [[NSNotificationCenter defaultCenter] postNotificationName:@"CallxEvent" object:nil userInfo:@{ @"event": @"onCallMissed", @"data": callData ?: @{} }];
            NSUserDefaults *defaults = [NSUserDefaults standardUserDefaults];
            [defaults setObject:@{ @"action": @"missed", @"data": callData ?: @{} } forKey:@"callx_pending_action"];
            [defaults synchronize];
            if (completion) { completion(); }
        } else if ([triggerType isEqualToString:@"answered_elsewhere"]) {
            RCTLogInfo(@"CallxPushKitHandler: Processing call answered elsewhere");
            
            // Handle call answered elsewhere
            [self handleCallAnsweredElsewhere:callData];
            if (completion) { completion(); }
        } else {
            RCTLogWarn(@"CallxPushKitHandler: Unknown trigger type or invalid data - completing anyway");
            
            // Always complete to avoid app termination
            if (completion) {
                completion();
            }
        }
    } else {
        // Not VoIP push - complete immediately
        if (completion) {
            completion();
        }
    }
}

- (void)pushRegistry:(PKPushRegistry *)registry didUpdatePushCredentials:(PKPushCredentials *)pushCredentials forType:(PKPushType)type {
    if ([type isEqualToString:PKPushTypeVoIP]) {
        // Convert token data to string
        NSString *token = [pushCredentials.token description];
        token = [token stringByTrimmingCharactersInSet:[NSCharacterSet characterSetWithCharactersInString:@"<>"]];
        token = [token stringByReplacingOccurrencesOfString:@" " withString:@""];
        
        self.voipToken = token;
        RCTLogInfo(@"CallxPushKitHandler: VoIP push credentials updated: %@", token);
    }
}

#pragma mark - CXProviderDelegate

- (void)providerDidReset:(CXProvider *)provider {
    RCTLogInfo(@"CallxPushKitHandler: CallKit provider did reset");
    self.currentCallUUID = nil;
}

- (void)provider:(CXProvider *)provider performStartCallAction:(CXStartCallAction *)action {
    RCTLogInfo(@"CallxPushKitHandler: Start call action performed");
    [action fulfill];
}

- (void)provider:(CXProvider *)provider performAnswerCallAction:(CXAnswerCallAction *)action {
    RCTLogInfo(@"CallxPushKitHandler: Answer call action performed");
    
    // Update CallKit UI to connected state
    CXCallUpdate *update = [[CXCallUpdate alloc] init];
    // Note: hasConnected and hasEnded are deprecated properties
    // CallKit automatically manages call state based on actions
    
    [self.provider reportCallWithUUID:action.callUUID updated:update];
    
    // Check if call logging is enabled for answered calls (from app config)
    NSDictionary *appCfg = self.configuration[@"app"];
    BOOL callLoggingEnabled = appCfg && appCfg[@"enabledLogPhoneCall"] ? [appCfg[@"enabledLogPhoneCall"] boolValue] : YES;
    
    if (callLoggingEnabled) {
        RCTLogInfo(@"CallxPushKitHandler: Call logged to phone history (answered)");
    } else {
        RCTLogInfo(@"CallxPushKitHandler: Call logging disabled for answered calls");
    }
    
    // Fulfill the action
    [action fulfill];
    
    RCTLogInfo(@"CallxPushKitHandler: CallKit UI transitioned to connected state");
}

- (void)provider:(CXProvider *)provider performEndCallAction:(CXEndCallAction *)action {
    RCTLogInfo(@"CallxPushKitHandler: End call action performed");
    
    // Update CallKit UI to ended state
    CXCallUpdate *update = [[CXCallUpdate alloc] init];
    // Note: hasConnected and hasEnded are deprecated properties
    // CallKit automatically manages call state based on actions
    
    [self.provider reportCallWithUUID:action.callUUID updated:update];
    
    // Check if call logging is enabled for ended calls (from app config)
    NSDictionary *appCfg = self.configuration[@"app"];
    BOOL callLoggingEnabled = appCfg && appCfg[@"enabledLogPhoneCall"] ? [appCfg[@"enabledLogPhoneCall"] boolValue] : YES;
    
    if (callLoggingEnabled) {
        RCTLogInfo(@"CallxPushKitHandler: Call logged to phone history (ended)");
    } else {
        RCTLogInfo(@"CallxPushKitHandler: Call logging disabled");
    }
    
    // Clear current call
    if ([action.callUUID isEqual:self.currentCallUUID]) {
        self.currentCallUUID = nil;
    }
    
    // Fulfill the action
    [action fulfill];
    
    RCTLogInfo(@"CallxPushKitHandler: CallKit UI transitioned to ended state");
}

- (void)provider:(CXProvider *)provider performSetHeldCallAction:(CXSetHeldCallAction *)action {
    [action fulfill];
}

- (void)provider:(CXProvider *)provider performSetMutedCallAction:(CXSetMutedCallAction *)action {
    [action fulfill];
}

@end 