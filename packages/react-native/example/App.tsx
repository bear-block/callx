import React, {useEffect, useRef, useState} from 'react';
import {Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions} from 'react-native';
import {createCallxPreview} from '@bear-block/callx/preview';
import type {CommandResult, Snapshot} from '@bear-block/callx';
import {createDeviceDemo, hasDeviceHost, hostStatus, requestPermissions, selectEndpoint} from './DeviceHost';
import type {HostStatus} from './DeviceHost';

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
  return <Text style={styles.timer}>{pad(Math.floor(seconds / 60))}:{pad(seconds % 60)}</Text>;
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const counter = useRef(0);
  const inFlight = useRef(false);
  const {width} = useWindowDimensions();

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
        const capabilities = await current.callx.setup({appName:'Acme Support'});
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
  const input=()=>({callId:'demo-'+Date.now()+'-'+ ++counter.current,displayName:'hao.dev7',handle:'sip:hao.dev7@example.invalid'});
  function button(label:string, action:(p:Preview)=>Promise<unknown>, enabled=true, variant='light') {
    const disabled=!enabled||!ready||busy;
    return <Pressable key={label} accessibilityRole="button" accessibilityLabel={label}
      accessibilityState={{disabled}} disabled={disabled} onPress={()=>void run(action)}
      style={[styles.button,variant==='dark'&&styles.darkButton,variant==='danger'&&styles.dangerButton,disabled&&styles.disabled]}>
      <Text style={[styles.buttonText,variant!=='light'&&styles.white]}>{label}</Text>
    </Pressable>;
  }
  return <ScrollView style={styles.page} contentContainerStyle={styles.pageContent}>
    <View style={styles.container}>
      <Text style={styles.brand}>callx / playground</Text>
      <Text style={styles.title}>One call. Every state.</Text>
      <Text style={styles.subtitle}>React Native SDK · Acme Support{ '\n' }Explore native calling and the shared call contract.</Text>
      <View style={styles.buttons}>
        {(['simulator', 'device'] as const).map(next => <Pressable key={next} accessibilityRole="button"
          disabled={live || busy || (next === 'device' && !hasDeviceHost)} onPress={() => setMode(next)}
          style={[styles.button, mode === next && styles.darkButton,
            (live || busy || (next === 'device' && !hasDeviceHost)) && styles.disabled]}>
          <Text style={[styles.buttonText, mode === next && styles.white]}>{next === 'device' ? 'Device' : 'Simulator'}</Text>
        </Pressable>)}
      </View>
      <View style={styles.notice}><Text style={styles.noticeText}>{mode === 'device'
        ? 'DEVICE TRIAL · Real system call UI. Local signaling and Android FCM test pushes; Android audio is real with the media server (LiveKit), otherwise simulated.'
        : 'PREVIEW ONLY · No real calls, microphone, push or system call UI.'}</Text>
        {host?.platform === 'ios' && host.simulator && <Text style={styles.noticeText}>
          iOS Simulator may end CallKit calls immediately. Use an iPhone for call lifecycle trials.
        </Text>}
      </View>
      <View style={[styles.columns,width<800&&styles.stacked]}>
        <View style={styles.callPanel}>
          <Text style={styles.status}>{call?.state.toUpperCase()??'READY FOR A CALL'}</Text>
          <View style={styles.avatar}><Text style={styles.initials}>HD</Text></View>
          <Text style={styles.caller}>{call?.displayName??'Your next conversation'}</Text>
          <Text style={styles.callDetail}>{call ? call.callId+' · '+call.direction : 'Trigger an invitation from the test controls.'}</Text>
          {call?.acceptedAtMs!==undefined&&call.state!=='ended'&&<CallTimer startedAtMs={call.acceptedAtMs}/>}
          <Text style={[styles.callDetail,{marginTop:24}]}>{call?.mediaInterrupted?'◌ Media interrupted — reconnecting':call?.mediaReady?'● Media ready':'○ Media not connected'}</Text>
          {call?.endReason&&<Text style={styles.callDetail}>Reason: {call.endReason}</Text>}
          <View style={[styles.buttons,{marginTop:24,justifyContent:'center'}]}>
            {button('Answer',p=>p.callx.answer(call!.callId),call?.state==='incoming','dark')}
            {button(call?.muted?'Unmute':'Mute',p=>p.callx.setMuted(call!.callId,!call!.muted),media)}
            {button(call?.state==='held'?'Resume':'Hold',p=>p.callx.setHeld(call!.callId,call!.state!=='held'),media)}
            {button(call?.state==='incoming'?'Decline':'End call',p=>p.callx.end(call!.callId),live,'danger')}
          </View>
        </View>
        <View style={styles.controls}>
          <Text style={styles.sectionTitle}>01 / Simulate the outside world</Text>
          <Text style={styles.body}>These controls belong to the test harness, not your production app.</Text>
          <View style={styles.buttons}>
            {button('Incoming call',p=>p.simulator.incoming(input()),!live)}
            {button('Start outgoing',p=>p.callx.startCall(input()),!live)}
            {button('Remote answers',p=>p.simulator.remoteAnswered(),call?.state==='outgoing')}
            {button('Connect media',p=>p.simulator.mediaConnected(),call?.state==='connecting')}
            {button('Remote ends',p=>p.simulator.remoteEnded(),live)}
            {mode === 'simulator' && button('Reset preview',p=>p.simulator.reset())}
            {mode === 'device' && button('Permissions', () => requestPermissions())}
          </View>
          <Text style={[styles.sectionTitle,{marginTop:28}]}>02 / Observe the contract</Text>
          <Text style={styles.code}>sequence  {snapshot.sequence}{'\n'}muted  {String(call?.muted??false)}{'\n'}execution  {mode === 'device' ? 'native' : 'preview'}</Text>
          {error&&<Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
          <Text style={styles.body}>{ready ? (mode === 'device' ? 'SDK configured · native runtime' : 'SDK configured · memory only') : 'Configuring SDK…'}</Text>
        </View>
      </View>
      {mode === 'device' && host && <View>
        <Text style={[styles.sectionTitle,{marginTop:24}]}>Native host</Text>
        {host.platform === 'android' && <Text selectable style={styles.log}>{host.pushToken
          ? 'FCM token  '+host.pushToken
          : host.pushReady ? 'Waiting for FCM token…' : 'No FCM. Add packages/secrets/google-services.json and prebuild.'}</Text>}
        <View style={styles.buttons}>{host.endpoints.map((endpoint, index) =>
          button((endpoint.current ? '✓ ' : '') + endpoint.name, () => selectEndpoint(index), live))}</View>
        {host.events.map((line, index) => <Text key={index+'-'+line} style={styles.log}>{line}</Text>)}
      </View>}
      <Text style={[styles.sectionTitle,{marginTop:32}]}>Event timeline</Text>
      {timeline.map((line,i)=><Text key={i+'-'+line} style={styles.log}>{line}</Text>)}
      <Text style={styles.footer}>callx 0.1.1 / React Native + shared contract / Not a native-call certification</Text>
    </View>
  </ScrollView>;
}
const styles=StyleSheet.create({
  timer:{color:'#fff',fontSize:20,marginTop:16,fontVariant:['tabular-nums']},
  page:{flex:1,backgroundColor:'#f5f4ef'},pageContent:{padding:24,paddingTop:48},
  container:{width:'100%',maxWidth:1120,alignSelf:'center'},
  brand:{fontSize:18,fontWeight:'800',color:'#172c2a'},
  title:{fontSize:40,fontWeight:'800',letterSpacing:-1.5,color:'#172c2a',marginTop:34},
  subtitle:{fontSize:16,lineHeight:26,color:'#46544f',marginTop:10},
  notice:{backgroundColor:'#ffebcf',padding:16,borderRadius:12,marginVertical:24},
  noticeText:{fontWeight:'700',color:'#6d4319'},
  columns:{flexDirection:'row',gap:36,alignItems:'flex-start'},stacked:{flexDirection:'column'},
  callPanel:{flex:1,alignSelf:'stretch',alignItems:'center',backgroundColor:'#172c2a',padding:28,borderRadius:24},
  status:{color:'#9bddc5',fontSize:12,letterSpacing:2},avatar:{width:76,height:76,borderRadius:38,backgroundColor:'#d7e9de',alignItems:'center',justifyContent:'center',marginTop:28},
  initials:{fontSize:26,color:'#172c2a'},caller:{color:'#fff',fontSize:26,fontWeight:'700',marginTop:18,textAlign:'center'},
  callDetail:{color:'#b7c9c4',marginTop:10,textAlign:'center'},
  controls:{flex:1,alignSelf:'stretch'},sectionTitle:{fontSize:20,fontWeight:'700',color:'#172c2a',marginBottom:8},
  body:{fontSize:14,lineHeight:22,color:'#46544f',marginBottom:16},
  buttons:{flexDirection:'row',flexWrap:'wrap',gap:8},button:{paddingVertical:12,paddingHorizontal:16,borderWidth:1,borderColor:'#c4d4c9',borderRadius:22,backgroundColor:'#f5f4ef'},
  buttonText:{fontWeight:'600',color:'#145c46'},darkButton:{backgroundColor:'#145c46',borderColor:'#145c46'},dangerButton:{backgroundColor:'#a94135',borderColor:'#a94135'},white:{color:'#fff'},disabled:{opacity:0.35},
  code:{fontFamily:'monospace',lineHeight:26,color:'#172c2a',marginVertical:12},error:{color:'#a94135',marginBottom:12},
  log:{fontFamily:'monospace',fontSize:12,lineHeight:22,color:'#46544f'},footer:{fontSize:12,color:'#65736b',marginTop:24},
});
