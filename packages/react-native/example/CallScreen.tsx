import React from 'react';
import {StyleSheet, View} from 'react-native';
import {CallxCallScreen, CallxCallBackdrop, type CallxCallBrand} from '@bear-block/callx/ui';
import {CallxVideoView} from './Video';
export const callBrand = {backgroundColor: '#102b24', accentColor: '#a7f3d0', surfaceColor: '#102b2499', logo: <CallxLogo />};
export type CallBrand = CallxCallBrand;
function CallxLogo() {
  return <View accessibilityLabel="Callx" style={s.logo}>
    <View style={s.waveOuter} /><View style={s.waveInner} /><View style={s.dot} />
  </View>;
}
export function CallBackdrop({brand = callBrand}: {brand?: CallBrand}) {return <CallxCallBackdrop brand={brand} />;}
export function CallScreen(props: Omit<React.ComponentProps<typeof CallxCallScreen>, 'renderVideo'>) {
  return <CallxCallScreen {...props} brand={props.brand ?? callBrand} renderVideo={(source, mirror) =>
    <CallxVideoView callId={props.call.callId} source={source} mirror={mirror} style={{flex: 1}} />} />;
}
const s = StyleSheet.create({
  logo: {width: 104, height: 104, borderRadius: 26, backgroundColor: '#175c46'},
  dot: {position: 'absolute', left: 27, bottom: 26, width: 18, height: 18, borderRadius: 9, backgroundColor: '#fff'},
  waveInner: {position: 'absolute', left: 27, top: 40, width: 36, height: 36, borderTopWidth: 7, borderRightWidth: 7, borderTopRightRadius: 36, borderColor: '#a7f3d0'},
  waveOuter: {position: 'absolute', left: 27, top: 20, width: 58, height: 58, borderTopWidth: 7, borderRightWidth: 7, borderTopRightRadius: 58, borderColor: '#4fd1a5'},
});
