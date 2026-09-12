import React, {useEffect, useRef, useState} from 'react';
import {Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions} from 'react-native';
import {createCallxPreview} from '@bear-block/callx/preview';
import type {CommandResult, Snapshot} from '@bear-block/callx';

type Preview = ReturnType<typeof createCallxPreview>;
export default function App() {
  const preview = useRef<Preview | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot>({sequence:'0',call:null});
  const [timeline, setTimeline] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const counter = useRef(0);
  const inFlight = useRef(false);
  const {width} = useWindowDimensions();

  useEffect(() => {
    // Own one preview per mount. StrictMode re-mount creates a fresh simulator.
    const current = createCallxPreview();
    preview.current = current;
    let mounted = true;
    const stop = current.callx.observe(value => {
      setSnapshot(value);
      setTimeline(lines => [`#${value.sequence}  ${value.call?.state ?? 'idle'} · media ${value.call?.mediaReady ? 'ready (simulated)' : 'not ready'}`, ...lines].slice(0,8));
    });
    current.callx.setup({appName:'Acme Support'}).then(
      () => {if(mounted) setReady(true);},
      cause => {if(mounted) setError(String(cause));},
    );
    return () => {mounted=false; stop(); current.callx.dispose(); preview.current=null;};
  }, []);

  async function run(action: (current: Preview) => Promise<unknown>) {
    const current = preview.current;
    if (!current || !ready || inFlight.current) return;
    inFlight.current=true; setBusy(true); setError(null);
    try {
      const result = await action(current) as CommandResult | undefined;
      if(preview.current !== current) return;
      if(result?.operationId) setTimeline(lines => [result.operationId+' · applied in preview',...lines].slice(0,8));
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
  const input=()=>({callId:'demo-'+ ++counter.current,displayName:'hao.dev7'});
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
      <Text style={styles.subtitle}>React Native SDK · Acme Support{ '\n' }Explore the integration before we build the native runtime.</Text>
      <View style={styles.notice}><Text style={styles.noticeText}>PREVIEW ONLY · No real calls, microphone, push or system call UI.</Text></View>
      <View style={[styles.columns,width<800&&styles.stacked]}>
        <View style={styles.callPanel}>
          <Text style={styles.status}>{call?.state.toUpperCase()??'READY FOR A CALL'}</Text>
          <View style={styles.avatar}><Text style={styles.initials}>LN</Text></View>
          <Text style={styles.caller}>{call?.displayName??'Your next conversation'}</Text>
          <Text style={styles.callDetail}>{call ? call.callId+' · '+call.direction : 'Trigger an invitation from the simulator.'}</Text>
          <Text style={[styles.callDetail,{marginTop:24}]}>{call?.mediaReady?'● Media ready — simulated, no audio':'○ Media not connected'}</Text>
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
            {button('Reset preview',p=>p.simulator.reset())}
          </View>
          <Text style={[styles.sectionTitle,{marginTop:28}]}>02 / Observe the contract</Text>
          <Text style={styles.code}>sequence  {snapshot.sequence}{'\n'}muted  {String(call?.muted??false)}{'\n'}execution  preview</Text>
          {error&&<Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
          <Text style={styles.body}>{ready?'SDK configured · memory only':'Configuring SDK…'}</Text>
        </View>
      </View>
      <Text style={[styles.sectionTitle,{marginTop:32}]}>Event timeline</Text>
      {timeline.map((line,i)=><Text key={i+'-'+line} style={styles.log}>{line}</Text>)}
      <Text style={styles.footer}>callx 0.0.0-preview.1 / React Native + shared contract / Not a native-call certification</Text>
    </View>
  </ScrollView>;
}
const styles=StyleSheet.create({
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
