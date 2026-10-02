// CallxVideoView: one video source of a call, rendered natively by the video media adapter
// (ADR-0010). Import it from '@bear-block/callx/video' so the main entry stays free of React Native.
//
//   <CallxVideoView callId={call.callId} source="remote" style={{flex: 1}} />
//   <CallxVideoView callId={call.callId} source="local" mirror style={styles.preview} />
//
// The view is empty until the source exists: remote video once `call.remoteVideo` is true, the
// local camera once `call.localVideo` is 'on'. Two views may show the same source.
export {default as CallxVideoView} from './specs/CallxVideoViewNativeComponent.js';
export type {NativeProps as CallxVideoViewProps} from './specs/CallxVideoViewNativeComponent.js';
