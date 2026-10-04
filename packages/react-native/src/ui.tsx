import React from 'react';
import {Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View, BackHandler, AppState, AccessibilityInfo, Animated, useWindowDimensions, type StyleProp, type ViewStyle} from 'react-native';
import type {Snapshot} from './index.js';
export {CallxPresentationController} from './presentation.ts';
export type {CallPresentation} from './presentation.ts';

export type CallxCallBrand = {backgroundColor: string; accentColor: string; logo: React.ReactNode; foregroundColor?: string; surfaceColor?: string; dangerColor?: string};
const callBrand: CallxCallBrand = {backgroundColor: '#20252b', accentColor: '#fff', logo: <Text style={{color: '#fff', fontSize: 40}}>☎</Text>};
export function CallxCallBackdrop({brand = callBrand}: {brand?: CallxCallBrand}) {
  return <View style={[s.backdrop, {backgroundColor: brand.backgroundColor}]}>{brand.logo}</View>;
}

/** Optional glyphs; hosts may pass their own icon to CallxCallControl instead. */
export function CallxControlGlyph({name, color = '#fff', size = 24}: {size?: number; name: 'microphone' | 'speaker' | 'hold' | 'camera' | 'switchCamera' | 'minimize' | 'pictureInPicture' | 'more' | 'end' | 'answer'; color?: string}) {
  const line = {backgroundColor: color};
  const box = (style: ViewStyle) => <View style={[{position: 'absolute'}, style]}/>;
  return <View pointerEvents="none" accessible={false} style={{width: size, height: size, alignItems: 'center', justifyContent: 'center'}}><View style={{width: 36, height: 36, transform: [{scale: size/36}]}}>
    {name === 'more' && [8, 16, 24].map(left => <View key={left} style={{position: 'absolute', left, top: 16, width: 4, height: 4, borderRadius: 2, backgroundColor: color}}/>)}
    {name === 'pictureInPicture' && <>{box({left: 3, top: 7, width: 30, height: 23, borderWidth: 2, borderColor: color, borderRadius: 3})}{box({left: 18, top: 18, width: 11, height: 8, ...line})}</>}
    {name === 'microphone' && <>{box({left: 14, top: 3, width: 8, height: 19, borderRadius: 5, ...line})}{box({left: 9, top: 12, width: 18, height: 15, borderWidth: 2, borderTopWidth: 0, borderColor: color, borderBottomLeftRadius: 10, borderBottomRightRadius: 10})}{box({left: 17, top: 26, width: 2, height: 6, ...line})}{box({left: 12, top: 31, width: 12, height: 2, ...line})}</>}
    {name === 'hold' && <>{box({left: 9, top: 7, width: 6, height: 22, borderRadius: 1, ...line})}{box({left: 21, top: 7, width: 6, height: 22, borderRadius: 1, ...line})}</>}
    {name === 'speaker' && <>{box({left: 4, top: 13, width: 7, height: 11, ...line})}{box({left: 6, top: 6, width: 0, height: 0, borderTopWidth: 12, borderBottomWidth: 12, borderRightWidth: 12, borderTopColor: 'transparent', borderBottomColor: 'transparent', borderRightColor: color})}{box({left: 23, top: 11, width: 9, height: 16, borderWidth: 2, borderLeftWidth: 0, borderColor: color, borderTopRightRadius: 12, borderBottomRightRadius: 12})}</>}
    {name === 'camera' && <>{box({left: 3, top: 10, width: 22, height: 17, borderWidth: 2, borderColor: color, borderRadius: 4})}{box({left: 25, top: 12, width: 0, height: 0, borderTopWidth: 7, borderBottomWidth: 7, borderRightWidth: 7, borderTopColor: 'transparent', borderBottomColor: 'transparent', borderRightColor: color})}</>}
    {name === 'minimize' && <>{box({left: 8, top: 17, width: 12, height: 2, ...line, transform: [{rotate: '45deg'}]})}{box({left: 16, top: 17, width: 12, height: 2, ...line, transform: [{rotate: '-45deg'}]})}</>}
    {name === 'switchCamera' && <Text style={{color, textAlign: 'center', fontSize: 32, lineHeight: 36}}>{'↻'}</Text>}
    {(name === 'end' || name === 'answer') && <View style={{width: 36, height: 36, transform: name === 'answer' ? [{rotate: '-135deg'}] : undefined}}>{box({left: 5, top: 11, width: 26, height: 17, borderTopWidth: 4, borderColor: color, borderTopLeftRadius: 18, borderTopRightRadius: 18})}{box({left: 3, top: 17, width: 10, height: 7, borderRadius: 3, ...line, transform: [{rotate: '-25deg'}]})}{box({left: 23, top: 17, width: 10, height: 7, borderRadius: 3, ...line, transform: [{rotate: '25deg'}]})}</View>}
  </View></View>;
}
/** Rendering only: the host supplies the command and its observed selected/disabled state. */
export function CallxCallControl({label, icon, onPress, selected = false, disabled = false, destructive = false, brand = callBrand, style, compact = false, size}: {
  label: string; icon: React.ReactNode | ((color: string) => React.ReactNode); onPress: () => void;
  selected?: boolean; disabled?: boolean; destructive?: boolean; brand?: CallxCallBrand; style?: StyleProp<ViewStyle>; compact?: boolean; size?: number;
}) {
  const diameter = size ?? 58;
  const color = selected && !destructive ? brand.backgroundColor : brand.foregroundColor ?? '#fff';
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{disabled, selected}}
    disabled={disabled} onPress={onPress} style={[s.control, {width: compact ? diameter : Math.max(84, diameter), minHeight: diameter}, compact && {height: diameter, justifyContent: 'center'}, disabled && {opacity: .4}, style]}>
    <View style={[s.circle, {width: diameter, height: diameter, borderRadius: diameter / 2}, {backgroundColor: destructive ? brand.dangerColor ?? '#eb434b' : selected ? brand.foregroundColor ?? '#fff' : brand.surfaceColor ?? '#ffffff2b'}]}>
      {typeof icon === 'function' ? icon(color) : icon}
    </View>{!compact && <Text style={[s.controlLabel, {color: brand.foregroundColor ?? '#fff'}]}>{label}</Text>}
  </Pressable>;
}

type Props = {
  call: NonNullable<Snapshot['call']>;
  brand?: CallxCallBrand;
  elapsed: React.ReactNode;
  controls: React.ReactNode;
  localControls: React.ReactNode;
  leadingControls?: React.ReactNode;
  onBack: () => void;
  error: string | null;
  nativeVideo: boolean;
  renderVideo: (source: 'local' | 'remote', mirror: boolean) => React.ReactNode;
  contentInsets?: {top: number; right: number; bottom: number; left: number};
  compactVideoControls?: boolean;
  autoHideControls?: boolean; controlsTimeoutMs?: number; controlsPinned?: boolean;
  minimizeLabel?: string;
  endControl?: React.ReactNode;
  header?: React.ReactNode;
  statusLabel?: string;
  previewPosition?: 'topRight' | 'topLeft';
  previewStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
  labels?: {done?: string; cameraPaused?: string; localPreview?: string};
};
export function CallxCallScreen({call, brand = callBrand, elapsed, controls, endControl, localControls, leadingControls, onBack, error, nativeVideo, renderVideo, minimizeLabel = 'Minimize call', contentInsets, compactVideoControls = true, autoHideControls = true, controlsTimeoutMs = 5000, controlsPinned = false, header, statusLabel, previewPosition = 'topRight', previewStyle, style, labels}: Props) {
  const Content = contentInsets ? View : SafeAreaView;
  const {height, fontScale} = useWindowDimensions();
  const ended = call.state === 'ended';
  const remote = !ended && nativeVideo && call.remoteVideo;
  const local = !ended && nativeVideo && call.localVideo === 'on';
  const video = remote || local;
  const videoLayout = compactVideoControls && (video || (!ended && call.video));
  const scroll = fontScale > 1.5 || (!videoLayout && height < 580);
  const [appForeground, setAppForeground] = React.useState(AppState.currentState === 'active');
  React.useEffect(() => {
    const subscription = AppState.addEventListener('change', state => setAppForeground(state === 'active'));
    return () => subscription.remove();
  }, []);
  const [visible, setVisible] = React.useState(true);
  const [reduceMotion, setReduceMotion] = React.useState(false);
  const opacity = React.useRef(new Animated.Value(1)).current;
  const [screenReader, setScreenReader] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const hideEnabled = appForeground && video && call.state === 'active' && autoHideControls && !controlsPinned && !screenReader && !error && !call.mediaInterrupted;
  const cancelTimer = () => {if (timer.current !== undefined) clearTimeout(timer.current);};
  const arm = () => {cancelTimer(); if (hideEnabled) timer.current = setTimeout(() => setVisible(false), Math.max(1000, controlsTimeoutMs));};
  const reveal = () => {setVisible(true); arm();};
  React.useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isScreenReaderEnabled().then(value => {if(mounted) setScreenReader(value);});
    AccessibilityInfo.isReduceMotionEnabled().then(value => {if(mounted) setReduceMotion(value);});
    const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    const subscription = AccessibilityInfo.addEventListener('screenReaderChanged', setScreenReader);
    return () => {mounted = false; subscription.remove(); motion.remove();};
  }, []);
  React.useEffect(() => {setVisible(true); arm(); return cancelTimer;}, [hideEnabled, controlsTimeoutMs, call.callId]);
  const chromeVisible = !hideEnabled || visible;
  React.useEffect(() => {
    const animation = Animated.timing(opacity, {toValue: chromeVisible ? 1 : 0, duration: reduceMotion ? 0 : 180, useNativeDriver: true});
    animation.start(); return () => animation.stop();
  }, [chromeVisible, reduceMotion, opacity]);

  const foreground = brand.foregroundColor ?? '#fff';
  const state = statusLabel ?? (ended ? 'Call ended' : call.state === 'incoming' ? 'Incoming call' : call.state === 'outgoing' ? 'Calling…'
    : call.state === 'held' ? 'On hold' : call.mediaInterrupted ? 'Reconnecting…' : call.mediaReady ? 'Connected' : 'Connecting…');
  const surface = brand.surfaceColor ?? '#00000045';
  return <View onTouchStart={() => {if (chromeVisible) arm();}} style={[s.screen, {backgroundColor: brand.backgroundColor}, style]}>
    <CallxCallBackdrop brand={brand}/>
    {video && <View style={StyleSheet.absoluteFill}>{renderVideo(remote ? 'remote' : 'local', !remote && call.cameraFacing !== 'back')}</View>}
    {video && <View pointerEvents="none" style={[StyleSheet.absoluteFill, {backgroundColor: '#00000016'}]}/>}
    <Content style={[s.safe, contentInsets && {paddingTop: contentInsets.top + 12, paddingBottom: contentInsets.bottom + 12, paddingLeft: contentInsets.left + 20, paddingRight: contentInsets.right + 20}]}>
      <ScrollView scrollEnabled={scroll} contentContainerStyle={{flexGrow: 1, minHeight: scroll ? (fontScale > 1.5 ? 1000 : 700) : undefined}}>
      {header !== undefined ? <Animated.View pointerEvents={chromeVisible ? 'auto' : 'none'} accessibilityElementsHidden={!chromeVisible} importantForAccessibility={chromeVisible ? 'auto' : 'no-hide-descendants'} style={{opacity}}>{header}</Animated.View> : <Animated.View pointerEvents={chromeVisible ? 'auto' : 'none'} accessibilityElementsHidden={!chromeVisible} importantForAccessibility={chromeVisible ? 'auto' : 'no-hide-descendants'} style={[s.header, {opacity}] }>
        <View style={{gap: 12}}><Pressable accessibilityRole="button" accessibilityLabel={ended ? labels?.done ?? 'Done' : minimizeLabel} onPress={onBack} style={[s.back, {backgroundColor: surface}]}>
          <CallxControlGlyph name="minimize" color={foreground}/>
        </Pressable>{leadingControls}</View>
        <View style={s.identity}><Text numberOfLines={2} style={[s.name, {color: foreground, fontSize: video ? 22 : 32}]}>{call.displayName}</Text>
          <Text style={[s.state, {color: brand.accentColor, backgroundColor: video ? surface : 'transparent'}]}>{state}</Text>{!ended && elapsed}</View>
        <View style={{width: remote && local ? 104 : 58}}/>
      </Animated.View>}
      <View pointerEvents="none" style={s.spacer}/>
      {call.localVideo === 'blocked' && <Text style={[s.message, {color: foreground, backgroundColor: surface}]}>{labels?.cameraPaused ?? 'Camera paused'}</Text>}
      {error && <Text accessibilityRole="alert" style={[s.message, {color: foreground, backgroundColor: surface}]}>{error}</Text>}
      {!ended && <Animated.View pointerEvents={chromeVisible ? 'auto' : 'none'} accessibilityElementsHidden={!chromeVisible} importantForAccessibility={chromeVisible ? 'auto' : 'no-hide-descendants'} style={[s.controls, videoLayout && s.videoControls, {opacity}, {backgroundColor: video ? surface : 'transparent'}]}>
        <ScrollView horizontal={videoLayout} style={{maxHeight: Math.max(100, height * .32)}} contentContainerStyle={videoLayout ? s.videoControlRow : s.controlGrid} showsVerticalScrollIndicator={false}>{controls}{videoLayout && endControl}</ScrollView>
        {!videoLayout && !!endControl && <View style={s.endControl}>{endControl}</View>}
      </Animated.View>}
      {ended && <Pressable accessibilityRole="button" accessibilityLabel={labels?.done ?? 'Done'} onPress={onBack} style={[s.done, {backgroundColor: surface}]}><Text style={{color: foreground}}>{labels?.done ?? 'Done'}</Text></Pressable>}
      </ScrollView>
    </Content>
    {remote && local && <Content pointerEvents="box-none" style={[StyleSheet.absoluteFill, contentInsets && {paddingTop: contentInsets.top, paddingLeft: contentInsets.left, paddingRight: contentInsets.right}]}>
      <View accessibilityLabel={labels?.localPreview ?? 'Local camera preview'} style={[s.local,
        {position: 'relative', top: 0, alignSelf: previewPosition === 'topRight' ? 'flex-end' : 'flex-start', marginTop: 20, marginHorizontal: 20, height: height < 580 ? 96 : 140}, previewStyle]}>
        {renderVideo('local', call.cameraFacing !== 'back')}
        <View style={s.localControls}>{localControls}</View>
      </View>
    </Content>}
    {local && !remote && !!localControls && <Content pointerEvents="box-none" style={[StyleSheet.absoluteFill, contentInsets && {paddingTop: contentInsets.top, paddingLeft: contentInsets.left, paddingRight: contentInsets.right}]}>
      <Animated.View pointerEvents={chromeVisible ? 'auto' : 'none'} accessibilityElementsHidden={!chromeVisible} importantForAccessibility={chromeVisible ? 'auto' : 'no-hide-descendants'} style={{alignSelf: 'flex-end', marginTop: 20, marginHorizontal: 20, opacity}}>{localControls}</Animated.View>
    </Content>}
    {!chromeVisible && <Pressable accessibilityRole="button" accessibilityLabel="Show call controls" onPress={reveal} style={StyleSheet.absoluteFill}/>}
  </View>;
}
const s = StyleSheet.create({
  screen: {flex: 1}, safe: {flex: 1, paddingHorizontal: 20, paddingVertical: 12}, backdrop: {...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center'},
  header: {flexDirection: 'row', alignItems: 'flex-start', paddingTop: 8}, identity: {flex: 1, alignItems: 'center', gap: 6, paddingHorizontal: 8},
  name: {fontWeight: '300', textAlign: 'center', textShadowColor: '#0007', textShadowRadius: 5}, state: {fontSize: 14, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12, textAlign: 'center'},
  back: {width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center'},
  local: {position: 'absolute', top: 16, width: 96, height: 140, borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: '#ffffff80', backgroundColor: '#0007'},
  localControls: {position: 'absolute', bottom: 4, right: 4}, spacer: {flex: 1, minHeight: 12},
  videoControls: {paddingVertical: 8, borderRadius: 28}, videoControlRow: {gap: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexGrow: 1},
  controls: {paddingVertical: 16, borderRadius: 28, marginBottom: 8}, controlGrid: {gap: 16, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center'},
  control: {width: 84, alignItems: 'center', gap: 8}, circle: {width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center'}, controlLabel: {fontSize: 12, textAlign: 'center'}, endControl: {alignItems: 'center', marginTop: 20},
  message: {textAlign: 'center', padding: 10, marginBottom: 8, borderRadius: 12}, done: {alignSelf: 'center', borderRadius: 24, paddingVertical: 14, paddingHorizontal: 32, marginBottom: 24},
});

/** Place once above app navigation; its children remain mounted while a call is expanded. */
export function CallxCallOverlay({children, expanded, minimized, systemPictureInPicture, onMinimize, contentInsets}: {
  contentInsets?: {top: number; right: number; bottom: number; left: number}; children: React.ReactNode; expanded?: React.ReactNode; minimized?: React.ReactNode; systemPictureInPicture?: React.ReactNode; onMinimize: () => void;
}) {
  React.useEffect(() => {
    if (!expanded || systemPictureInPicture) return;
    const stop = BackHandler.addEventListener('hardwareBackPress', () => {onMinimize(); return true;});
    return () => stop.remove();
  }, [!!expanded, !!systemPictureInPicture, onMinimize]);
  const InsetView = contentInsets ? View : SafeAreaView;
  const covering = systemPictureInPicture || expanded;
  return <View style={{flex: 1}}>
    <View style={{flex: 1, display: covering ? 'none' : 'flex'}} pointerEvents={covering ? 'none' : 'auto'}
      accessibilityElementsHidden={!!covering} importantForAccessibility={covering ? 'no-hide-descendants' : 'auto'}>{children}</View>
    {!!covering && <View style={StyleSheet.absoluteFill}>{covering}</View>}
    {!covering && !!minimized && <InsetView pointerEvents="box-none" style={[StyleSheet.absoluteFill, {alignItems: 'flex-end', justifyContent: 'flex-end', padding: 16}, contentInsets && {paddingBottom: contentInsets.bottom + 16, paddingRight: contentInsets.right + 16, paddingTop: contentInsets.top + 16, paddingLeft: contentInsets.left + 16}]}>{minimized}</InsetView>}
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
