#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(CallxLiveKit, NSObject)
RCT_EXTERN_METHOD(configure:(NSString *)tokenUrl headers:(NSDictionary *)headers resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(reset:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
@end
