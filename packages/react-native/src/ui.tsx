import React from 'react';
import {Pressable, SafeAreaView, StyleSheet, Text, View, BackHandler} from 'react-native';
import type {Snapshot} from './index.js';
export {CallxPresentationController} from './presentation.ts';
export type {CallPresentation} from './presentation.ts';

export type CallxCallBrand = {backgroundColor: string; accentColor: string; logo: React.ReactNode};
const callBrand: CallxCallBrand = {backgroundColor: '#20252b', accentColor: '#fff', logo: <Text style={{color: '#fff', fontSize: 40}}>☎</Text>};
export function CallxCallBackdrop({brand = callBrand}: {brand?: CallxCallBrand}) {
  return <View style={[s.backdrop, {backgroundColor: brand.backgroundColor}]}>{brand.logo}</View>;
}

type Props = {
  call: NonNullable<Snapshot['call']>;
  brand?: CallxCallBrand;
  elapsed: React.ReactNode;
  controls: React.ReactNode;
  localControls: React.ReactNode;
  onBack: () => void;
  error: string | null;
  nativeVideo: boolean;
  renderVideo: (source: 'local' | 'remote', mirror: boolean) => React.ReactNode;
  minimizeLabel?: string;
};
export function CallxCallScreen({call, brand = callBrand, elapsed, controls, localControls, onBack, error, nativeVideo, renderVideo, minimizeLabel = 'Minimize call'}: Props) {
  const ended = call.state === 'ended';
  const remote = !ended && nativeVideo && call.remoteVideo;
  const local = !ended && nativeVideo && call.localVideo === 'on';
  const state = ended ? 'Call ended' : call.state === 'incoming' ? 'Incoming call' : call.state === 'outgoing' ? 'Calling…'
    : call.state === 'held' ? 'On hold' : call.mediaInterrupted ? 'Reconnecting…' : call.mediaReady ? 'Connected' : 'Connecting…';
  return <View style={[s.screen, {backgroundColor: brand.backgroundColor}]}>
    <CallxCallBackdrop brand={brand} />
    {(remote || local) && <View style={StyleSheet.absoluteFill}>{renderVideo(remote ? 'remote' : 'local', !remote && call.cameraFacing !== 'back')}</View>}
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <Pressable accessibilityRole="button" accessibilityLabel={ended ? 'Done' : minimizeLabel} onPress={onBack} style={s.back}>
          <Text style={s.backText}>{ended ? 'Done' : '‹'}</Text>
        </Pressable>
        <View style={s.identity}><Text style={s.name}>{call.displayName}</Text>
          <Text style={[s.state, {color: brand.accentColor}]}>{state}</Text>{!ended && elapsed}</View>
        <View style={{width: 48}} />
      </View>
      {remote && local && <View accessibilityLabel="Local camera preview" style={s.local}>
        {renderVideo('local', call.cameraFacing !== 'back')}
        <View style={s.localControls}>{localControls}</View>
      </View>}
      <View style={s.spacer} />
      {call.localVideo === 'blocked' && <Text style={s.message}>Camera paused</Text>}
      {error && <Text accessibilityRole="alert" style={s.message}>{error}</Text>}
      {!ended && <View style={s.controls}>{controls}</View>}
      {ended && <Pressable accessibilityRole="button" accessibilityLabel="Done" onPress={onBack} style={s.done}><Text style={s.backText}>Done</Text></Pressable>}
    </SafeAreaView>
  </View>;
}
const s = StyleSheet.create({
  screen: {flex: 1}, safe: {flex: 1, padding: 20}, backdrop: {...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center'},
  logo: {width: 104, height: 104, borderRadius: 26, backgroundColor: '#175c46'},
  dot: {position: 'absolute', left: 27, bottom: 26, width: 18, height: 18, borderRadius: 9, backgroundColor: '#fff'},
  waveInner: {position: 'absolute', left: 27, top: 40, width: 36, height: 36, borderTopWidth: 7, borderRightWidth: 7, borderTopRightRadius: 36, borderColor: '#a7f3d0'},
  waveOuter: {position: 'absolute', left: 27, top: 20, width: 58, height: 58, borderTopWidth: 7, borderRightWidth: 7, borderTopRightRadius: 58, borderColor: '#4fd1a5'},
  header: {flexDirection: 'row', alignItems: 'flex-start', paddingTop: 20}, identity: {flex: 1, alignItems: 'center', padding: 10, borderRadius: 20, backgroundColor: '#102b24dd'},
  name: {color: '#fff', fontSize: 22, fontWeight: '700'}, state: {fontSize: 14, marginTop: 6},
  back: {width: 48, height: 48, borderRadius: 24, backgroundColor: '#102b24dd', alignItems: 'center', justifyContent: 'center'}, backText: {color: '#fff', fontSize: 17, fontWeight: '600'},
  local: {position: 'absolute', top: 150, right: 20, width: 100, height: 150, borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: '#ffffff66', backgroundColor: '#102b24'},
  localControls: {position: 'absolute', bottom: 4, right: 4}, spacer: {flex: 1},
  controls: {padding: 16, gap: 10, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', backgroundColor: '#102b24ee', borderRadius: 26, marginBottom: 20},
  message: {color: '#fff', textAlign: 'center', backgroundColor: '#102b24dd', padding: 10, marginBottom: 12, borderRadius: 12},
  done: {alignSelf: 'center', backgroundColor: '#175c46', borderRadius: 24, paddingVertical: 14, paddingHorizontal: 32, marginBottom: 24},
});

/** Place once above app navigation; its children remain mounted while a call is expanded. */
export function CallxCallOverlay({children, expanded, minimized, systemPictureInPicture, onMinimize}: {
  children: React.ReactNode; expanded?: React.ReactNode; minimized?: React.ReactNode; systemPictureInPicture?: React.ReactNode; onMinimize: () => void;
}) {
  React.useEffect(() => {
    if (!expanded || systemPictureInPicture) return;
    const stop = BackHandler.addEventListener('hardwareBackPress', () => {onMinimize(); return true;});
    return () => stop.remove();
  }, [!!expanded, !!systemPictureInPicture, onMinimize]);
  const covering = systemPictureInPicture || expanded;
  return <View style={{flex: 1}}>
    <View style={{flex: 1, display: covering ? 'none' : 'flex'}} pointerEvents={covering ? 'none' : 'auto'}
      accessibilityElementsHidden={!!covering} importantForAccessibility={covering ? 'no-hide-descendants' : 'auto'}>{children}</View>
    {!!covering && <View style={StyleSheet.absoluteFill}>{covering}</View>}
    {!covering && !!minimized && <SafeAreaView pointerEvents="box-none" style={[StyleSheet.absoluteFill, {alignItems: 'flex-end', justifyContent: 'flex-end', padding: 16}]}>{minimized}</SafeAreaView>}
  </View>;
}
/** A mini-call inside the app, independent of the OS PiP Activity. */
export function CallxMiniCall({displayName, preview, brand = callBrand, onExpand, onEnd}: {
  displayName: string; preview?: React.ReactNode; brand?: CallxCallBrand; onExpand: () => void; onEnd: () => void;
}) {
  return <View style={{width: 144, height: 220, borderRadius: 18, overflow: 'hidden', backgroundColor: brand.backgroundColor, borderWidth: 1, borderColor: '#ffffff66'}}>
    <Pressable accessibilityRole="button" accessibilityLabel="Return to call" onPress={onExpand} style={{flex: 1}}>
      <CallxCallBackdrop brand={brand} />{preview}
      <Text numberOfLines={1} style={{position: 'absolute', bottom: 0, left: 0, right: 0, padding: 8, color: '#fff', backgroundColor: '#0009'}}>{displayName}</Text>
    </Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel="End call" onPress={onEnd} style={{padding: 10, backgroundColor: '#b53936'}}><Text style={{color: '#fff', textAlign: 'center'}}>End call</Text></Pressable>
  </View>;
}
