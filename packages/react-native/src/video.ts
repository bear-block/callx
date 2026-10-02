// CallxVideoView: one video source of a call, rendered natively by the video media adapter
// (ADR-0010). Import it from '@bear-block/callx/video' so the main entry stays free of React Native.
//
//   <CallxVideoView callId={call.callId} source="remote" style={{flex: 1}} />
//   <CallxVideoView callId={call.callId} source="local" mirror style={styles.preview} />
//
// The view is empty until the source exists: remote video once `call.remoteVideo` is true, the
// local camera once `call.localVideo` is 'on'. Two views may show the same source.
import {NativeEventEmitter, NativeModules, TurboModuleRegistry} from 'react-native';

export {default as CallxVideoView} from './specs/CallxVideoViewNativeComponent.ts';
export type {NativeProps as CallxVideoViewProps} from './specs/CallxVideoViewNativeComponent.ts';

type PictureInPictureModule = {
  configurePictureInPicture(options: {automatic: boolean}): void;
  enterPictureInPicture(): Promise<boolean>;
};
const pip = () => (TurboModuleRegistry.get('Callx') ?? NativeModules.Callx) as PictureInPictureModule | undefined;

/**
 * Picture-in-picture for video calls (ADR-0010 addendum), Android only for now. With `automatic`,
 * the app enters picture-in-picture when the user leaves it during a video call (Android 12+).
 * The app's activity declares android:supportsPictureInPicture (Expo: pictureInPicture: true).
 */
export function configurePictureInPicture(options: {automatic: boolean}): void {
  pip()?.configurePictureInPicture(options);
}

/** Enters picture-in-picture now; false where the device or the app does not allow it. */
export async function enterPictureInPicture(): Promise<boolean> {
  return (await pip()?.enterPictureInPicture()) ?? false;
}

/** Calls `listener(true)` when the app enters picture-in-picture and `false` when it leaves. */
export function addPictureInPictureListener(listener: (inPictureInPicture: boolean) => void): () => void {
  const module = pip();
  if (!module) return () => {};
  const subscription = new NativeEventEmitter(module).addListener('callxPictureInPicture',
    (value) => listener(value === true));
  return () => subscription.remove();
}
