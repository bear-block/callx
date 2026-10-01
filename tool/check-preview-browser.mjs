// Optional local smoke check. Start a dedicated Chrome with --remote-debugging-port=9223.
// Requires Node 22+, no npm dependencies. Does not connect to your normal browser profile.
import {writeFileSync, mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';

const endpoint = await (await fetch('http://127.0.0.1:9223/json/version')).json();
const socket = new WebSocket(endpoint.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, {once:true});
  socket.addEventListener('error', reject, {once:true});
});
const pending = new Map();
let nextId = 0;
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data);
  const request = pending.get(message.id);
  if (!request) return;
  pending.delete(message.id);
  clearTimeout(request.timer);
  if (message.error) request.reject(new Error(JSON.stringify(message.error)));
  else request.resolve(message.result);
});
function send(method, params = {}, sessionId) {
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => {pending.delete(id); reject(new Error('CDP timeout: '+method));},15000);
    pending.set(id,{resolve,reject,timer});
    socket.send(JSON.stringify({id,method,params,sessionId}));
  });
}
async function evaluate(session, expression) {
  const response = await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},session);
  if (response.exceptionDetails) throw new Error(JSON.stringify(response.exceptionDetails));
  return response.result.value;
}
async function until(session, expression) {
  const deadline = Date.now()+20000;
  while (Date.now()<deadline) {
    if (await evaluate(session, expression)) return;
    await new Promise(resolve=>setTimeout(resolve,150));
  }
  throw new Error('Page condition not met: '+expression);
}
const dir = fileURLToPath(new URL('../build/preview-screenshots/',import.meta.url));
mkdirSync(dir,{recursive:true});
const targets=[];
try {
  for (const [name,port] of [['react-native',4174],['flutter',4173]]) {
    const {targetId}=await send('Target.createTarget',{url:'about:blank'});
    targets.push(targetId);
    const {sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
    await send('Page.enable',{},sessionId);
    await send('Emulation.setDeviceMetricsOverride',{width:1280,height:1100,deviceScaleFactor:1,mobile:false},sessionId);
    await send('Page.navigate',{url:'http://127.0.0.1:'+port},sessionId);
    if (name==='react-native') {
      await until(sessionId,"document.body.innerText.includes('SDK configured')");
      const click = async label => {
        const found = await evaluate(sessionId,`(() => {
          const button = [...document.querySelectorAll('[role="button"],button')].find(e=>e.textContent===${JSON.stringify(label)});
          if(!button || button.getAttribute('aria-disabled')==='true') return false;
          button.click(); return true;
        })()`);
        assert.equal(found,true,'Enabled button: '+label);
      };
      for (const [label,state] of [['Incoming call','INCOMING'],['Answer','CONNECTING'],['Connect media','ACTIVE'],['Hold','HELD'],['Resume','ACTIVE']]) {
        await click(label);
        await until(sessionId,`document.body.innerText.includes(${JSON.stringify(state)})`);
      }
      await click('Mute');
      await until(sessionId,"document.body.innerText.includes('Unmute')");
      const image=await send('Page.captureScreenshot',{format:'png'},sessionId);
      writeFileSync(dir+name+'.png',Buffer.from(image.data,'base64'));
      await click('End call');
      await until(sessionId,"document.body.innerText.includes('localHangup')");
      await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true},sessionId);
      await new Promise(resolve=>setTimeout(resolve,300));
      assert.equal(await evaluate(sessionId,'document.documentElement.scrollWidth <= 390'),true,'No mobile horizontal overflow');
      console.log('RN browser flow + mobile overflow check: pass');
    } else {
      await until(sessionId,"!!document.querySelector('flutter-view')");
      await new Promise(resolve=>setTimeout(resolve,2500));
      const image=await send('Page.captureScreenshot',{format:'png'},sessionId);
      writeFileSync(dir+name+'.png',Buffer.from(image.data,'base64'));
      console.log('Flutter browser screenshot captured (interaction covered by widget test)');
    }
  }
} finally {
  for (const targetId of targets) await send('Target.closeTarget',{targetId});
  if (process.argv.includes('--close-browser')) await send('Browser.close');
  socket.close();
}
