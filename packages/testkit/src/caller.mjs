// A headless Chrome caller: opens the call console page with a fake microphone and drives it
// over the DevTools protocol, so a test can invite, join and leave a call's media as the caller.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function openCaller(consoleUrl, { port = 9333 } = {}) {
  const profile = mkdtempSync(join(tmpdir(), 'callx-caller-'));
  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required',
    consoleUrl], { stdio: 'ignore' });
  chrome.on('error', () => {});
  let page;
  for (let attempt = 0; attempt < 50 && !page; attempt++) {
    await sleep(200);
    try { page = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((target) => target.type === 'page'); } catch {}
  }
  if (!page) { chrome.kill(); throw new Error(`Chrome did not start (set CHROME to its path; tried ${CHROME}).`); }
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve); socket.addEventListener('error', reject); });
  let id = 0; const pending = new Map();
  socket.addEventListener('message', (message) => {
    const data = JSON.parse(message.data); pending.get(data.id)?.(data); pending.delete(data.id);
  });
  const evaluate = (expression) => new Promise((resolve) => {
    const n = ++id;
    pending.set(n, (data) => resolve(data.result?.result?.value ?? data.result?.exceptionDetails?.exception?.description));
    socket.send(JSON.stringify({ id: n, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }));
  });
  await sleep(1500);
  return {
    evaluate,
    /** Chrome writes its profile until it exits; remove it afterwards and never fail the run on it. */
    async close() {
      socket.close();
      const exited = new Promise((resolve) => chrome.once('exit', resolve));
      chrome.kill();
      await Promise.race([exited, sleep(3000)]);
      try { rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch {}
    },
  };
}
