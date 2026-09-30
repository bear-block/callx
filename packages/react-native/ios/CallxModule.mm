// The Callx TurboModule. It conforms to NativeCallxSpec, which React Native's codegen generates
// from src/specs/NativeCallx.ts, and forwards every call to CallxModuleImpl (Swift).
#import <AVFAudio/AVFAudio.h>
#import <CallKit/CallKit.h>
#import <PushKit/PushKit.h>
#import <React/RCTEventEmitter.h>
#import <CallxSpec/CallxSpec.h>

#if __has_include("callx_react_native-Swift.h")
#import "callx_react_native-Swift.h"
#else
#import <callx_react_native/callx_react_native-Swift.h>
#endif

@interface CallxModule : RCTEventEmitter <NativeCallxSpec>
@end

@implementation CallxModule {
  CallxModuleImpl *_impl;
}

RCT_EXPORT_MODULE(Callx)

+ (BOOL)requiresMainQueueSetup { return NO; }

- (instancetype)init {
  if (self = [super init]) {
    _impl = [CallxModuleImpl new];
    __weak CallxModule *weakSelf = self;
    _impl.emit = ^(id body) { [weakSelf sendEventWithName:@"callxEvent" body:body]; };
  }
  return self;
}

- (NSArray<NSString *> *)supportedEvents { return @[@"callxEvent"]; }
- (void)startObserving { [_impl startObserving]; }
- (void)stopObserving { [_impl stopObserving]; }

- (void)setup:(NSDictionary *)config resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
  [_impl setup:config resolve:resolve reject:reject];
}
- (void)execute:(NSDictionary *)command resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
  [_impl execute:command resolve:resolve reject:reject];
}
- (void)queryOperation:(NSDictionary *)query resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
  [_impl queryOperation:query resolve:resolve reject:reject];
}
- (void)openSession:(NSDictionary *)request resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
  [_impl openSession:request resolve:resolve reject:reject];
}
- (void)acknowledge:(NSDictionary *)request resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
  [_impl acknowledge:request resolve:resolve reject:reject];
}
- (void)closeSession:(NSDictionary *)request resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
  [_impl closeSession:request resolve:resolve reject:reject];
}
- (void)getSnapshot:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
  [_impl getSnapshot:resolve reject:reject];
}
- (void)getPushToken:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
  [_impl getPushToken:resolve reject:reject];
}
- (void)dispose { [_impl dispose]; }

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params {
  return std::make_shared<facebook::react::NativeCallxSpecJSI>(params);
}

@end
