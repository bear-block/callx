// CallxVideoView (ADR-0010): a container the video media adapter renders into. The Fabric
// component reads the props React Native's codegen generates from
// src/specs/CallxVideoViewNativeComponent.ts; the legacy view manager serves the old architecture.
#import <AVFAudio/AVFAudio.h>
#import <CallKit/CallKit.h>
#import <PushKit/PushKit.h>
#import <React/RCTViewManager.h>
#import <UIKit/UIKit.h>

#if __has_include("callx_react_native-Swift.h")
#import "callx_react_native-Swift.h"
#else
#import <callx_react_native/callx_react_native-Swift.h>
#endif

#ifdef RCT_NEW_ARCH_ENABLED
#import <React/RCTViewComponentView.h>
#import <react/renderer/components/CallxSpec/ComponentDescriptors.h>
#import <react/renderer/components/CallxSpec/Props.h>
#import <react/renderer/components/CallxSpec/RCTComponentViewHelpers.h>

using namespace facebook::react;

@interface CallxVideoComponentView : RCTViewComponentView
@end

@implementation CallxVideoComponentView {
  UIView *_container;
  CallxVideoBinding *_binding;
}

+ (ComponentDescriptorProvider)componentDescriptorProvider
{
  return concreteComponentDescriptorProvider<CallxVideoViewComponentDescriptor>();
}

- (instancetype)initWithFrame:(CGRect)frame
{
  if (self = [super initWithFrame:frame]) {
    _props = std::make_shared<const CallxVideoViewProps>();
    _container = [[UIView alloc] initWithFrame:self.bounds];
    _container.clipsToBounds = YES;
    self.contentView = _container;
    _binding = [CallxVideoBinding new];
  }
  return self;
}

- (void)updateProps:(Props::Shared const &)props oldProps:(Props::Shared const &)oldProps
{
  const auto &next = *std::static_pointer_cast<CallxVideoViewProps const>(props);
  [_binding updateWithContainer:_container
                         callId:[NSString stringWithUTF8String:next.callId.c_str()]
                         source:[NSString stringWithUTF8String:toString(next.source).c_str()]
                            fit:[NSString stringWithUTF8String:toString(next.fit).c_str()]
                         mirror:next.mirror];
  [super updateProps:props oldProps:oldProps];
}

- (void)prepareForRecycle
{
  [_binding detach];
  [super prepareForRecycle];
}

@end

Class<RCTComponentViewProtocol> CallxVideoViewCls(void)
{
  return CallxVideoComponentView.class;
}
#else

/// The old architecture's view: props arrive one by one, then the batch completes.
@interface CallxVideoLegacyView : UIView
@property (nonatomic, copy) NSString *callId;
@property (nonatomic, copy) NSString *source;
@property (nonatomic, copy) NSString *fit;
@property (nonatomic, assign) BOOL mirror;
@end

@implementation CallxVideoLegacyView {
  CallxVideoBinding *_binding;
}

- (instancetype)initWithFrame:(CGRect)frame
{
  if (self = [super initWithFrame:frame]) {
    self.clipsToBounds = YES;
    _binding = [CallxVideoBinding new];
  }
  return self;
}

- (void)didSetProps:(NSArray<NSString *> *)changedProps
{
  [_binding updateWithContainer:self
                         callId:self.callId ?: @""
                         source:self.source ?: @"remote"
                            fit:self.fit ?: @"cover"
                         mirror:self.mirror];
}

- (void)removeFromSuperview
{
  [_binding detach];
  [super removeFromSuperview];
}

@end

@interface CallxVideoViewManager : RCTViewManager
@end

@implementation CallxVideoViewManager

RCT_EXPORT_MODULE(CallxVideoView)

- (UIView *)view
{
  return [CallxVideoLegacyView new];
}

RCT_EXPORT_VIEW_PROPERTY(callId, NSString)
RCT_EXPORT_VIEW_PROPERTY(source, NSString)
RCT_EXPORT_VIEW_PROPERTY(fit, NSString)
RCT_EXPORT_VIEW_PROPERTY(mirror, BOOL)

@end
#endif
