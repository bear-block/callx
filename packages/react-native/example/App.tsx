import React, {useEffect, useRef, useState} from 'react';
import {Modal, StatusBar, Platform, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import {SafeAreaProvider, SafeAreaView, useSafeAreaInsets} from 'react-native-safe-area-context';
import {createCallxPreview} from '@bear-block/callx/preview';
import type {CommandResult, Snapshot} from '@bear-block/callx';
import {CallxVideoView, addPictureInPictureListener, configurePictureInPicture} from './Video';
import {createDeviceDemo, requestCameraPermission, hasDeviceHost, hostStatus, requestPermissions, selectEndpoint} from './DeviceHost';
import type {HostStatus} from './DeviceHost';
import {CallxCallControl, CallxControlGlyph, CallxCallOverlay, CallxMiniCall, CallxPresentationController, type CallPresentation} from '@bear-block/callx/ui';
import {CallScreen, CallBackdrop, callBrand} from './CallScreen';

type Preview = ReturnType<typeof createCallxPreview>;

/** Elapsed time since the call was answered, like the Android call notification's timer. */
function CallTimer({startedAtMs}: {startedAtMs: number}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const ticker = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(ticker);
  }, []);
  const seconds = Math.max(0, Math.floor((now - startedAtMs) / 1000));
  const pad = (value: number) => String(value).padStart(2, '0');
  return <Text importantForAccessibility="no" style={styles.timer}>{pad(Math.floor(seconds / 60))}:{pad(seconds % 60)}</Text>;
}

export default function App() {
  return <SafeAreaProvider><ExampleApp /></SafeAreaProvider>;
}

function ExampleApp() {
  const insets = useSafeAreaInsets();
  const [selfName, setSelfName] = useState<'Steven' | 'hao.dev7'>('Steven');
  const peerName = selfName === 'Steven' ? 'hao.dev7' : 'Steven';
  const preview = useRef<Preview | null>(null);
  const [mode, setMode] = useState<'simulator' | 'device'>(hasDeviceHost ? 'device' : 'simulator');
  // Ask while the app is in use: the prompt cannot appear once a call rings on the lock screen.
  useEffect(() => { if (mode === 'device') requestPermissions().catch(() => {}); }, [mode]);
  const [host, setHost] = useState<HostStatus | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot>({sequence:'0',call:null});
  const [timeline, setTimeline] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [pictureInPicture, setPictureInPicture] = useState(false);
  const [automaticPiP, setAutomaticPiP] = useState(true);
  useEffect(() => {
    if (mode !== 'device' || Platform.OS !== 'android') return;
    return addPictureInPictureListener(setPictureInPicture);
  }, [mode]);
  useEffect(() => {
    if (mode === 'device' && Platform.OS === 'android') {
      configurePictureInPicture({automatic: automaticPiP});
      return () => configurePictureInPicture({automatic: false});
    }
  }, [mode, automaticPiP]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const counter = useRef(0);
  const inFlight = useRef(false);
  const presentation = useRef(new CallxPresentationController());
  const [presentationMode, setPresentationMode] = useState<CallPresentation>('hidden');
  const [diagnostics, setDiagnostics] = useState(false);
  const [audioPicker, setAudioPicker] = useState(false);
  function expandCall() {presentation.current.expand(); setPresentationMode(presentation.current.mode);}
  function minimizeCall() {presentation.current.minimize(); setPresentationMode(presentation.current.mode);}

  useEffect(() => {
    let mounted = true;
    let current: Preview | undefined;
    let stop: (() => void) | undefined;
    let statusTimer: ReturnType<typeof setInterval> | undefined;
    setReady(false); setError(null); setSnapshot({sequence:'0', call:null}); setTimeline([]); setHost(null);
    async function refreshHost() {
      try { const value = await hostStatus(); if (mounted) setHost(value); }
      catch (cause) { if (mounted) setError(String(cause)); }
    }
    async function initialize() {
      try {
        current = mode === 'device' ? await createDeviceDemo() : createCallxPreview();
        if (!mounted) { current.callx.dispose(); return; }
        preview.current = current;
        const capabilities = await current.callx.setup();
        if (!mounted) return;
        if (mode === 'device' && !capabilities.nativeCalling) throw new Error('Native host is not configured.');
        stop = current.callx.observe(value => {
          if (!mounted) return;
          setSnapshot(value);
          presentation.current.update(value.call);
          setPresentationMode(presentation.current.mode);
          setTimeline(lines => [`#${value.sequence}  ${value.call?.state ?? 'idle'} · media ${value.call?.mediaInterrupted ? 'interrupted' : value.call?.mediaReady ? 'ready' : 'not ready'}`, ...lines].slice(0,8));
        });
        setReady(true);
        if (mode === 'device') {
          await refreshHost();
          statusTimer = setInterval(() => void refreshHost(), 2000);
          if (!mounted) clearInterval(statusTimer);
        }
      } catch (cause) { if (mounted) setError(String(cause)); }
    }
    void initialize();
    return () => {
      mounted = false; stop?.(); current?.callx.dispose();
      if (statusTimer) clearInterval(statusTimer);
      if (preview.current === current) preview.current = null;
    };
  }, [mode]);

  async function run(action: (current: Preview) => Promise<unknown>) {
    const current = preview.current;
    if (!current || !ready || inFlight.current) return;
    inFlight.current=true; setBusy(true); setError(null);
    try {
      const result = await action(current) as CommandResult | undefined;
      if(preview.current !== current) return;
      if(result?.operationId) {
        setTimeline(lines => [result.operationId+' · '+result.status+' · '+result.execution,...lines].slice(0,8));
        if(result.status !== 'applied') setError(result.error?.message ?? result.status);
      }
    } catch(cause) {
      if(preview.current === current) setError(String(cause));
    } finally {
      inFlight.current=false;
      if(preview.current === current) setBusy(false);
    }
  }
  const call=snapshot.call;
  const live=!!call && call.state!=='ended';
  useEffect(() => {if (!live || pictureInPicture) setAudioPicker(false);}, [live, pictureInPicture]);
  const media=call?.state==='active'||call?.state==='held';
  const answered = media || call?.state === 'connecting';
  const cameraOn = call?.localVideo === 'on';
  const showVideo = live && (call?.video || call?.remoteVideo || cameraOn);
  const VideoView = CallxVideoView;
  const input=()=>({callId:'demo-'+Date.now()+'-'+ ++counter.current,displayName:peerName,handle:`sip:${peerName}@example.invalid`});
  function button(label:string, action:(p:Preview)=>Promise<unknown>, enabled=true, variant='light') {
    const disabled=!enabled||!ready||busy;
    return <Pressable key={label} accessibilityRole="button" accessibilityLabel={label}
      testID={"callx-" + label.toLowerCase().replaceAll(" ", "-")} accessibilityState={{disabled}} disabled={disabled} onPress={()=>void run(action)}
      style={[styles.button,variant==='dark'&&styles.darkButton,variant==='danger'&&styles.dangerButton,disabled&&styles.disabled]}>
      <Text style={[styles.buttonText,variant!=='light'&&styles.white]}>{label}</Text>
    </Pressable>;
  }
  const materialGlyphs = {microphone: 'mic', speaker: 'volume-up', hold: 'pause', camera: 'videocam', switchCamera: 'flip-camera-android', minimize: 'keyboard-arrow-down', pictureInPicture: 'picture-in-picture-alt', more: 'more-horiz', end: 'call-end', answer: 'call'} as const;
  function callControl(label: string, glyph: React.ComponentProps<typeof CallxControlGlyph>['name'], action: (p: Preview) => Promise<unknown>, enabled = true, selected = false, destructive = false) {
    return <CallxCallControl key={label} label={label} compact={!!showVideo && glyph !== 'answer'} icon={color => <MaterialIcons name={materialGlyphs[glyph]} size={28} color={color}/>}
      onPress={() => void run(action)} disabled={!enabled || !ready || busy} selected={selected} destructive={destructive} brand={callBrand}/>;
  }
  const callControls = <>
    {answered && callControl(call!.muted ? 'Unmute' : 'Mute', 'microphone', p => p.callx.setMuted(call!.callId, !call!.muted), media, call!.muted)}
    {answered && !showVideo && callControl(call!.state === 'held' ? 'Resume' : 'Hold', 'hold', p => p.callx.setHeld(call!.callId, call!.state !== 'held'), media, call!.state === 'held')}
    {answered && callControl(cameraOn ? 'Camera off' : 'Camera on', 'camera', async p => {
      if (!cameraOn && mode === 'device') await requestCameraPermission();
      return p.callx.setCamera(call!.callId, !cameraOn);
    }, true, cameraOn)}
    {cameraOn && !showVideo && !call?.remoteVideo && callControl('Switch camera', 'switchCamera', p => p.callx.switchCamera(call!.callId, call?.cameraFacing === 'back' ? 'front' : 'back'))}
    {!!host?.endpoints.length && answered && <CallxCallControl compact={!!showVideo} label="Audio output" icon={color => <MaterialIcons name="volume-up" size={28} color={color}/>}
      onPress={() => setAudioPicker(true)} disabled={busy} brand={callBrand}/>}


  </>;
  const endControl = live ? callControl(call?.state === 'incoming' ? 'Decline' : 'End call', 'end', p => p.callx.end(call!.callId), true, false, true) : null;
  const compact = <View style={{flex: 1, backgroundColor: callBrand.backgroundColor}}>
    <CallBackdrop />
    {showVideo && call && (call.remoteVideo || call.localVideo === 'on') && <VideoView callId={call.callId}
      source={call.remoteVideo ? 'remote' : 'local'} mirror={!call.remoteVideo && call.cameraFacing !== 'back'} style={{flex: 1}} />}
  </View>;
  const expanded = presentationMode === 'expanded' && call ? <CallScreen controlsPinned={busy || audioPicker} contentInsets={insets} call={call} controls={callControls} endControl={endControl} nativeVideo={mode === 'device'}
    elapsed={call.acceptedAtMs !== undefined ? <CallTimer startedAtMs={call.acceptedAtMs} /> : null}
    leadingControls={answered && !!showVideo ? callControl(call!.state === 'held' ? 'Resume' : 'Hold', 'hold', p => p.callx.setHeld(call!.callId, call!.state !== 'held'), media, call!.state === 'held') : undefined}
    localControls={<Pressable accessibilityRole="button" accessibilityLabel="Switch camera" disabled={busy} accessibilityState={{disabled: busy}} onPress={() => void run(p => p.callx.switchCamera(call.callId, call.cameraFacing === 'back' ? 'front' : 'back'))} style={{width: 48, height: 48, alignItems: 'center', justifyContent: 'center'}}><MaterialIcons style={{textShadowColor: '#000', textShadowRadius: 3}} name="flip-camera-android" size={20} color="#fff"/></Pressable>}
    onBack={minimizeCall} error={error} /> : null;
  const home = <SafeAreaView style={styles.page}><ScrollView contentContainerStyle={styles.pageContent}>
    <View style={styles.container}>
      <View style={styles.heading}><Text style={styles.title}>Callx</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={diagnostics ? 'Calls' : 'Diagnostics'} onPress={() => setDiagnostics(value => !value)}>
          <Text style={styles.link}>{diagnostics ? 'Calls' : 'Diagnostics'}</Text>
        </Pressable>
      </View>
      <Text style={styles.subtitle}>{diagnostics ? 'Test controls' : 'Your calls, in one place'}</Text>
      {!diagnostics && <Text style={styles.identity}>You: {selfName}</Text>}
      {diagnostics && <><Text style={styles.contactCaption}>Demo identity</Text>
        <View style={styles.buttons}>{(['Steven', 'hao.dev7'] as const).map(name => <Pressable key={name} accessibilityRole="button" accessibilityLabel={`Use ${name}`} disabled={live} accessibilityState={{disabled: live, selected: selfName === name}} onPress={() => setSelfName(name)} style={[styles.button, selfName === name && styles.darkButton]}><Text style={[styles.buttonText, selfName === name && styles.white]}>{name}</Text></Pressable>)}</View>
      </>}

      {!diagnostics && <View style={styles.contactCard}>
        <View style={styles.avatar}><Text style={styles.avatarText}>{peerName[0].toUpperCase()}</Text></View>
        <Text style={styles.contactName}>{peerName}</Text><Text style={styles.contactCaption}>Demo contact</Text>
        <Text style={styles.connection}>{live ? 'Call in progress' : ready ? 'Ready to call' : 'Connecting…'}</Text>
        <View style={styles.contactActions}>
          <CallxCallControl label="Voice call" brand={callBrand} disabled={!ready || busy || live}
            icon={color => <MaterialIcons name="call" size={28} color={color}/>} onPress={() => void run(p => p.callx.startCall(input()))}/>
          <CallxCallControl label="Video call" brand={callBrand} disabled={!ready || busy || live}
            icon={color => <MaterialIcons name="videocam" size={28} color={color}/>} onPress={() => void run(p => p.callx.startCall({...input(), video: true}))}/>
        </View>
      </View>}
      {call?.state === 'incoming' && mode === 'simulator' && <View style={styles.buttons}>
        {button('Answer', p => p.callx.answer(call.callId))}{button('Decline', p => p.callx.end(call.callId), true, 'danger')}
      </View>}
      {!live && call?.state === 'ended' && <Text style={styles.body}>Call ended</Text>}
      {diagnostics && <>
        <View style={styles.buttons}>
          {(['simulator', 'device'] as const).map(next => <Pressable key={next} accessibilityRole="button" accessibilityLabel={next === 'device' ? 'Device' : 'Simulator'}
            disabled={live || busy || (next === 'device' && !hasDeviceHost)} onPress={() => setMode(next)} style={[styles.button, mode === next && styles.darkButton, live && styles.disabled]}>
            <Text style={[styles.buttonText, mode === next && styles.white]}>{next === 'device' ? 'Device' : 'Simulator'}</Text>
          </Pressable>)}
        </View>
        <Text style={styles.body}>{mode === 'device' ? 'Calls on this device' : 'Simulated calls'}</Text>
        <View style={styles.buttons}>
          {button('Incoming call', p => p.simulator.incoming(input()), !live)}
          {button('Incoming video', p => p.simulator.incoming({...input(), video: true}), !live)}
          {button('Start outgoing', p => p.callx.startCall(input()), !live)}
          {button('Start outgoing video', p => p.callx.startCall({...input(), video: true}), !live)}
        </View>
      </>}
      {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      {diagnostics && <>
        <Text style={styles.sectionTitle}>Call simulation</Text>
        <View style={styles.buttons}>
          {call?.state === 'incoming' && mode === 'device' && button('Answer', p => p.callx.answer(call.callId))}
          {button('Remote answers', p => p.simulator.remoteAnswered(), call?.state === 'outgoing')}
          {button('Connect media', p => p.simulator.mediaConnected(), call?.state === 'connecting')}
          {button('Remote ends', p => p.simulator.remoteEnded(), live)}
          {mode === 'simulator' && button('Reset preview', p => p.simulator.reset())}
          {mode === 'device' && button('Permissions', () => requestPermissions())}
          {mode === 'device' && Platform.OS === 'android' && button(automaticPiP ? 'Auto PiP on' : 'Auto PiP off', async () => setAutomaticPiP(value => !value))}
        </View>
        <Text style={styles.sectionTitle}>State</Text>
        <Text selectable style={styles.log}>{call?.state.toUpperCase() ?? 'READY'} · sequence {snapshot.sequence}{'\n'}{call?.callId ?? 'No call'}{call?.endReason ? '\nReason: ' + call.endReason : ''}</Text>
        {host && <>
          <Text style={styles.sectionTitle}>Native host</Text>
          {host.platform === 'android' && <Text selectable style={styles.log}>{host.pushToken ? 'FCM token  ' + host.pushToken : 'No FCM token'}</Text>}
          <View style={styles.buttons}>{host.endpoints.map((endpoint, index) => button((endpoint.current ? '✓ ' : '') + endpoint.name, () => selectEndpoint(index), live))}</View>
          {host.events.map((line, index) => <Text key={index + '-' + line} style={styles.log}>{line}</Text>)}
        </>}
        <Text style={styles.sectionTitle}>Event log</Text>
        {timeline.map((line, index) => <Text key={index + '-' + line} style={styles.log}>{line}</Text>)}
      </>}
    </View>
  </ScrollView></SafeAreaView>;
  const minimized = presentationMode === 'minimized' && call ? <CallxMiniCall displayName={call.displayName}
    brand={callBrand} onExpand={expandCall} onEnd={() => void run(p => p.callx.end(call.callId))}
    preview={mode === 'device' && (call.remoteVideo || cameraOn) ? <VideoView callId={call.callId}
      source={call.remoteVideo ? 'remote' : 'local'} mirror={!call.remoteVideo && call.cameraFacing !== 'back'} style={StyleSheet.absoluteFill} /> : undefined} /> : null;
  return <><StatusBar barStyle={presentationMode === 'expanded' ? 'light-content' : 'dark-content'}/><CallxCallOverlay contentInsets={insets} expanded={expanded} minimized={minimized} onMinimize={minimizeCall}
    systemPictureInPicture={pictureInPicture ? compact : undefined}>{home}</CallxCallOverlay>
    <Modal visible={audioPicker && live && !pictureInPicture} transparent animationType="fade" onRequestClose={() => setAudioPicker(false)}>
      <View style={[styles.modalShade, {paddingBottom: insets.bottom + 20, paddingLeft: insets.left + 20, paddingRight: insets.right + 20}]}><ScrollView accessibilityViewIsModal style={[styles.audioSheet, {maxHeight: '80%'}]}>
        <Text style={styles.sectionTitle}>Audio output</Text>
        {host?.endpoints.map((endpoint, index) => <Pressable key={endpoint.name + index} accessibilityRole="button" accessibilityLabel={endpoint.name}
          accessibilityState={{selected: endpoint.current, disabled: busy}} disabled={busy} style={styles.route}
          onPress={() => {setAudioPicker(false); void run(async () => {if (!await selectEndpoint(index)) throw new Error('Audio route unavailable.');});}}>
          <Text style={styles.buttonText}>{endpoint.current ? '✓ ' : ''}{endpoint.name}</Text>
        </Pressable>)}
        <Pressable accessibilityRole="button" onPress={() => setAudioPicker(false)} style={styles.route}><Text style={styles.buttonText}>Cancel</Text></Pressable>
      </ScrollView></View>
    </Modal></>;

}
const styles = StyleSheet.create({
  identity: {color: '#52665e', fontSize: 14, marginTop: -16, marginBottom: 16},
  contactCard: {backgroundColor: '#172c2a', borderRadius: 32, padding: 28, alignItems: 'center'}, avatar: {width: 80, height: 80, borderRadius: 40, backgroundColor: '#d7e9de', alignItems: 'center', justifyContent: 'center'}, avatarText: {fontSize: 32, color: '#172c2a'},
  contactName: {fontSize: 30, fontWeight: '300', color: '#fff', marginTop: 18}, contactCaption: {color: '#a7f3d0', marginTop: 6}, connection: {color: '#d7e9de', fontSize: 13, marginTop: 26}, contactActions: {flexDirection: 'row', gap: 36, marginTop: 24},
  modalShade: {flex: 1, backgroundColor: '#0008', justifyContent: 'flex-end', padding: 20}, audioSheet: {backgroundColor: '#f3f7f4', borderRadius: 28, padding: 20}, route: {paddingVertical: 16},
  timer: {color: '#fff', fontSize: 24, fontWeight: '300', marginTop: 6, fontVariant: ['tabular-nums']},
  page: {flex: 1, backgroundColor: '#f3f7f4'}, pageContent: {padding: 24},
  container: {width: '100%', maxWidth: 640, alignSelf: 'center'}, heading: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  title: {fontSize: 32, fontWeight: '800', color: '#102b24'}, subtitle: {fontSize: 16, color: '#52665e', marginTop: 8, marginBottom: 28},
  link: {color: '#175c46', fontWeight: '600', padding: 8}, body: {color: '#52665e', marginVertical: 20},
  buttons: {flexDirection: 'row', flexWrap: 'wrap', gap: 10}, button: {paddingVertical: 12, paddingHorizontal: 16, borderRadius: 24, backgroundColor: '#e2eee7'},
  buttonText: {fontWeight: '600', color: '#175c46'}, darkButton: {backgroundColor: '#175c46'}, dangerButton: {backgroundColor: '#b53936'}, white: {color: '#fff'}, disabled: {opacity: .35},
  sectionTitle: {fontSize: 18, fontWeight: '700', color: '#102b24', marginTop: 28, marginBottom: 14},
  log: {fontFamily: 'monospace', fontSize: 12, lineHeight: 22, color: '#52665e'}, error: {color: '#b53936', marginTop: 16},
  ongoing: {backgroundColor: '#175c46', padding: 18, borderRadius: 16, marginBottom: 24}, ongoingText: {color: '#fff', fontWeight: '600'},
});
