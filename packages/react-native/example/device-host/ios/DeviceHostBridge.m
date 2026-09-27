#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(CallxDeviceHost, NSObject)
RCT_EXTERN_METHOD(invoke:(NSString *)method arguments:(NSDictionary *)arguments
                  resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
@end
