import React from 'react';
import {Pressable, SafeAreaView, StyleSheet, Text, View} from 'react-native';
import type {Snapshot} from '@bear-block/callx';
import {CallxVideoView} from './Video';

export const callBrand = {backgroundColor: '#102b24', accentColor: '#a7f3d0', logo: <CallxLogo />};
export type CallBrand = {backgroundColor: string; accentColor: string; logo: React.ReactNode};

function CallxLogo() {
  return <View accessibilityLabel="Callx" style={s.logo}>
    <View style={s.waveOuter} /><View style={s.waveInner} /><View style={s.dot} />
  </View>;
}
export function CallBackdrop({brand = callBrand}: {brand?: CallBrand}) {
  return <View style={[s.backdrop, {backgroundColor: brand.backgroundColor}]}>{brand.logo}</View>;
}

type Props = {
  call: NonNullable<Snapshot['call']>;
  brand?: CallBrand;
  elapsed: React.ReactNode;
  controls: React.ReactNode;
  localControls: React.ReactNode;
  onBack: () => void;
  error: string | null;
  nativeVideo: boolean;
};
export function CallScreen({call, brand = callBrand, elapsed, controls, localControls, onBack, error, nativeVideo}: Props) {
  const ended = call.state === 'ended';
  const remote = !ended && nativeVideo && call.remoteVideo;
  const local = !ended && nativeVideo && call.localVideo === 'on';
  const state = ended ? 'Call ended' : call.state === 'incoming' ? 'Incoming call' : call.state === 'outgoing' ? 'Calling…'
    : call.state === 'held' ? 'On hold' : call.mediaInterrupted ? 'Reconnecting…' : call.mediaReady ? 'Connected' : 'Connecting…';
  return <View style={[s.screen, {backgroundColor: brand.backgroundColor}]}>
    <CallBackdrop brand={brand} />
    {(remote || local) && <CallxVideoView callId={call.callId} source={remote ? 'remote' : 'local'}
      mirror={!remote && call.cameraFacing !== 'back'} style={StyleSheet.absoluteFill} />}
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <Pressable accessibilityRole="button" accessibilityLabel={ended ? 'Done' : 'Test controls'} onPress={onBack} style={s.back}>
          <Text style={s.backText}>{ended ? 'Done' : '‹'}</Text>
        </Pressable>
        <View style={s.identity}><Text style={s.name}>{call.displayName}</Text>
          <Text style={[s.state, {color: brand.accentColor}]}>{state}</Text>{!ended && elapsed}</View>
        <View style={{width: 48}} />
      </View>
      {remote && local && <View accessibilityLabel="Local camera preview" style={s.local}>
        <CallxVideoView callId={call.callId} source="local" mirror={call.cameraFacing !== 'back'} style={{flex: 1}} />
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
