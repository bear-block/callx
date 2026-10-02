import React, {useEffect, useRef, useState} from 'react';
import {Platform, Pressable, ScrollView, StyleSheet, Text, View, SafeAreaView} from 'react-native';
import {createCallxPreview} from '@bear-block/callx/preview';
import type {CommandResult, Snapshot} from '@bear-block/callx';
import {CallxVideoView, addPictureInPictureListener, configurePictureInPicture, enterPictureInPicture} from './Video';
import {createDeviceDemo, requestCameraPermission, hasDeviceHost, hostStatus, requestPermissions, selectEndpoint} from './DeviceHost';
import type {HostStatus} from './DeviceHost';
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
  const preview = useRef<Preview | null>(null);
  const [mode, setMode] = useState<'simulator' | 'device'>(hasDeviceHost ? 'device' : 'simulator');
  // Ask while the app is in use: the prompt cannot appear once a call rings on the lock screen.
  useEffect(() => { if (mode === 'device') requestPermissions().catch(() => {}); }, [mode]);
  const [host, setHost] = useState<HostStatus | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot>({sequence:'0',call:null});
  const [timeline, setTimeline] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [pictureInPicture, setPictureInPicture] = useState(false);
  const [automaticPiP, setAutomaticPiP] = useState(false);
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
  const [showCall, setShowCall] = useState(false);
  const [diagnostics, setDiagnostics] = useState(false);
  const presentedCall = useRef<string | null>(null);
  useEffect(() => {
    const call = snapshot.call;
    if (call && call.state !== 'incoming' && call.state !== 'ended' && presentedCall.current !== call.callId) {
      presentedCall.current = call.callId;
      setShowCall(true);
    }
  }, [snapshot.call?.callId, snapshot.call?.state]);

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
  const media=call?.state==='active'||call?.state==='held';
  const answered = media || call?.state === 'connecting';
  const cameraOn = call?.localVideo === 'on';
  const showVideo = live && (call?.video || call?.remoteVideo || cameraOn);
  const VideoView = CallxVideoView;
  const input=()=>({callId:'demo-'+Date.now()+'-'+ ++counter.current,displayName:'hao.dev7',handle:'sip:hao.dev7@example.invalid'});
  function button(label:string, action:(p:Preview)=>Promise<unknown>, enabled=true, variant='light') {
    const disabled=!enabled||!ready||busy;
    return <Pressable key={label} accessibilityRole="button" accessibilityLabel={label}
      testID={"callx-" + label.toLowerCase().replaceAll(" ", "-")} accessibilityState={{disabled}} disabled={disabled} onPress={()=>void run(action)}
      style={[styles.button,variant==='dark'&&styles.darkButton,variant==='danger'&&styles.dangerButton,disabled&&styles.disabled]}>
      <Text style={[styles.buttonText,variant!=='light'&&styles.white]}>{label}</Text>
    </Pressable>;
  }
  const callControls = <>
    {call?.state === 'incoming' && button('Answer', p => p.callx.answer(call.callId), true, 'dark')}
    {answered && button(call?.muted ? 'Unmute' : 'Mute', p => p.callx.setMuted(call!.callId, !call!.muted), media)}
    {answered && button(call?.state === 'held' ? 'Resume' : 'Hold', p => p.callx.setHeld(call!.callId, call!.state !== 'held'), media)}
    {answered && button(cameraOn ? 'Camera off' : 'Camera on', async p => {
      if (!cameraOn && mode === 'device') await requestCameraPermission();
      return p.callx.setCamera(call!.callId, !cameraOn);
    })}
    {cameraOn && !call?.remoteVideo && button('Switch camera', p => p.callx.switchCamera(call!.callId, call?.cameraFacing === 'back' ? 'front' : 'back'))}
    {host && host.endpoints.length > 1 && answered && button('Audio output', () => {
      const selected = host.endpoints.findIndex(endpoint => endpoint.current);
      return selectEndpoint((selected + 1) % host.endpoints.length);
    })}
    {mode === 'device' && Platform.OS === 'android' && !!showVideo && button('Picture in picture', async () => {
      if (!await enterPictureInPicture()) throw new Error('Picture in picture is unavailable.');
    })}
    {live && button(call?.state === 'incoming' ? 'Decline' : 'End call', p => p.callx.end(call!.callId), true, 'danger')}
  </>;
  if (pictureInPicture) return <View style={{flex: 1, backgroundColor: callBrand.backgroundColor}}>
    <CallBackdrop />
    {showVideo && call && (call.remoteVideo || call.localVideo === 'on') && <VideoView callId={call.callId}
      source={call.remoteVideo ? 'remote' : 'local'} mirror={!call.remoteVideo && call.cameraFacing !== 'back'} style={{flex: 1}} />}
  </View>;
  if (showCall && call) return <CallScreen call={call} controls={callControls} nativeVideo={mode === 'device'}
    elapsed={call.acceptedAtMs !== undefined ? <CallTimer startedAtMs={call.acceptedAtMs} /> : null}
    localControls={<Pressable accessibilityRole="button" accessibilityLabel="Switch camera" onPress={() => void run(p => p.callx.switchCamera(call.callId, call.cameraFacing === 'back' ? 'front' : 'back'))} style={{width: 36, height: 36, borderRadius: 18, backgroundColor: '#102b24dd', alignItems: 'center', justifyContent: 'center'}}><Text style={{color: '#fff', fontSize: 24}}>↻</Text></Pressable>}
    onBack={() => {setShowCall(false); setDiagnostics(live);}} error={error} />;
  return <SafeAreaView style={styles.page}><ScrollView contentContainerStyle={styles.pageContent}>
    <View style={styles.container}>
      <View style={styles.heading}><Text style={styles.title}>Callx</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={diagnostics ? 'Calls' : 'Diagnostics'} onPress={() => setDiagnostics(value => !value)}>
          <Text style={styles.link}>{diagnostics ? 'Calls' : 'Diagnostics'}</Text>
        </Pressable>
      </View>
      <Text style={styles.subtitle}>{diagnostics ? 'Test controls' : 'React Native example'}</Text>
      {call && live && call.state !== 'incoming' && <Pressable accessibilityRole="button" accessibilityLabel="Return to call" onPress={() => setShowCall(true)} style={styles.ongoing}>
        <Text style={styles.ongoingText}>{call.displayName} · Return to call</Text>
      </Pressable>}
      {call?.state === 'incoming' && mode === 'simulator' && <View style={styles.buttons}>
        {button('Answer', p => p.callx.answer(call.callId))}
        {button('Decline', p => p.callx.end(call.callId), true, 'danger')}
      </View>}
      {!live && call?.state === 'ended' && <Text style={styles.body}>Last call ended</Text>}
      <View style={styles.buttons}>
        {(['simulator', 'device'] as const).map(next => <Pressable key={next} accessibilityRole="button" accessibilityLabel={next === 'device' ? 'Device' : 'Simulator'}
          disabled={live || busy || (next === 'device' && !hasDeviceHost)} onPress={() => setMode(next)}
          style={[styles.button, mode === next && styles.darkButton, live && styles.disabled]}>
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
}
const styles = StyleSheet.create({
  timer: {color: '#fff', fontSize: 14, marginTop: 8, fontVariant: ['tabular-nums']},
  page: {flex: 1, backgroundColor: '#f3f7f4'}, pageContent: {padding: 24, paddingTop: 36},
  container: {width: '100%', maxWidth: 640, alignSelf: 'center'}, heading: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  title: {fontSize: 32, fontWeight: '800', color: '#102b24'}, subtitle: {fontSize: 16, color: '#52665e', marginTop: 8, marginBottom: 28},
  link: {color: '#175c46', fontWeight: '600', padding: 8}, body: {color: '#52665e', marginVertical: 20},
  buttons: {flexDirection: 'row', flexWrap: 'wrap', gap: 10}, button: {paddingVertical: 12, paddingHorizontal: 16, borderRadius: 24, backgroundColor: '#e2eee7'},
  buttonText: {fontWeight: '600', color: '#175c46'}, darkButton: {backgroundColor: '#175c46'}, dangerButton: {backgroundColor: '#b53936'}, white: {color: '#fff'}, disabled: {opacity: .35},
  sectionTitle: {fontSize: 18, fontWeight: '700', color: '#102b24', marginTop: 28, marginBottom: 14},
  log: {fontFamily: 'monospace', fontSize: 12, lineHeight: 22, color: '#52665e'}, error: {color: '#b53936', marginTop: 16},
  ongoing: {backgroundColor: '#175c46', padding: 18, borderRadius: 16, marginBottom: 24}, ongoingText: {color: '#fff', fontWeight: '600'},
});
