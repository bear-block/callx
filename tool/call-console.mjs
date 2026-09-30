#!/usr/bin/env node
// Local call console for Android device trials. It stands in for a call server: it sends FCM
// invitations and test signals, and tracks each call from the example app's host log.
//
//   npm run call:console [-- --service-account <file>] [--port 8787] [--host 0.0.0.0]
//
// Without --service-account it uses the first *adminsdk*.json or *service-account*.json in
// packages/secrets/. The example apps post their FCM token and host log to
// http://127.0.0.1:8787 once a second; the console keeps `adb reverse` set up so that address
// reaches this machine from every connected device. Test harness only: no auth, localhost only.
//
// Real audio: start a local LiveKit server with `npm run media:server`. The console then issues
// LiveKit tokens to the app (/api/media-token) and lets this page join each call as the caller.
// Options: --livekit-url (default ws://127.0.0.1:7880), --livekit-key, --livekit-secret
// (default devkey/secret, the `livekit-server --dev` credentials).
import { createHmac } from 'node:crypto';
import { execFile } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { sendAndroid } from './send-test-push.mjs';

const ONLINE_MS = 3000;
const TERMINAL = new Set(['ended', 'notRung', 'failed']);

// Host log lines that move a call along. The first matching pattern wins.
const TRANSITIONS = [
  [/^did not ring /, 'notRung'],
  [/^push for /, 'delivered'],
  [/^ringing /, 'ringing'],
  [/ended|ring deadline passed|^recovered /, 'ended'],
  [/answered/, 'answered'],
  [/^media connected/, 'active'],
  [/^media interrupted/, 'reconnecting'],
  [/^system surface held/, 'held'],
  [/^system surface resumed/, 'active'],
];

/** The call status a host log message implies, or null when it does not change the status. */
export function statusFrom(message) {
  for (const [pattern, status] of TRANSITIONS) if (pattern.test(message)) return status;
  return null;
}

/** A LiveKit access token (HS256 JWT) that lets [identity] join room [room] with audio. */
export function liveKitToken({ key, secret, room, identity, name, nowSeconds = Math.floor(Date.now() / 1000), ttlSeconds = 3600 }) {
  const part = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const unsigned = `${part({ alg: 'HS256', typ: 'JWT' })}.${part({
    iss: key, sub: identity, name: name ?? identity, nbf: nowSeconds, exp: nowSeconds + ttlSeconds,
    video: { room, roomJoin: true, canPublish: true, canSubscribe: true },
  })}`;
  return `${unsigned}.${createHmac('sha256', secret).update(unsigned).digest('base64url')}`;
}

/**
 * The LiveKit URL for a client that reached the console at [hostHeader]. The default local URL
 * is rewritten to the address that client used, so an iPhone on the network gets the Mac's IP.
 */
export function liveKitUrlFor(configured, hostHeader) {
  const hostname = hostHeader?.replace(/:\d+$/, '');
  if (!/^wss?:\/\/127\.0\.0\.1:/.test(configured) || !hostname || ['127.0.0.1', 'localhost'].includes(hostname)) return configured;
  return configured.replace('127.0.0.1', hostname);
}

/** Host log lines start with "HH:mm:ss  ". */
const messageOf = (line) => line.replace(/^\d\d:\d\d:\d\d {2}/, '');

export function createConsole({ send, now = Date.now }) {
  const devices = new Map();
  const calls = new Map();
  const note = (call, source, text) => call.timeline.push({ at: now(), source, text });

  function track(call, message) {
    note(call, 'device', message);
    const status = statusFrom(message);
    if (status && !TERMINAL.has(call.status)) call.status = status;
  }

  /** A device report carries the host's last 40 log lines, newest first. */
  function report({ app, model, token, events = [] }) {
    const key = `${app ?? 'app'} · ${model ?? 'device'}`;
    const device = devices.get(key) ?? { key, app, model, seen: new Set(), log: [] };
    devices.set(key, device);
    Object.assign(device, { token: token ?? device.token, lastSeen: now() });
    const fresh = events.filter((line) => !device.seen.has(line)).reverse();
    device.seen = new Set(events);
    for (const line of fresh) {
      device.log.unshift(line);
      const message = messageOf(line);
      for (const call of calls.values()) if (call.device === key && message.includes(call.callId)) track(call, message);
    }
    device.log.length = Math.min(device.log.length, 200);
  }

  async function invite({ device: key, name, expiresIn = 30 }) {
    const device = devices.get(key);
    if (!device?.token) throw new Error('Pick a device that has reported an FCM token.');
    const result = await send({ token: device.token, name: name || undefined, expiresIn });
    const call = { callId: result.callId, device: key, name: name || 'hao.dev7', status: 'sent',
      expiresAtMs: now() + Number(expiresIn) * 1000, timeline: [] };
    calls.set(call.callId, call);
    note(call, 'server', `invite sent (expires in ${expiresIn}s)`);
    record(call, result);
    return call;
  }

  async function signal({ callId, message, reason }) {
    const call = calls.get(callId);
    if (!call) throw new Error(`Unknown call ${callId}.`);
    const token = devices.get(call.device)?.token;
    const result = await send({ token, callId, message, reason });
    note(call, 'server', message === 'end' ? `end sent (${reason ?? 'remoteEnded'})` : 'remote answer sent');
    record(call, result);
    return call;
  }

  function record(call, result) {
    if (result.status === 200) return note(call, 'fcm', 'accepted by FCM');
    note(call, 'fcm', `FCM ${result.status}: ${JSON.stringify(result.response?.error?.message ?? result.response)}`);
    if (call.status === 'sent') call.status = 'failed';
  }

  function snapshot() {
    const at = now();
    return {
      devices: [...devices.values()].map(({ key, app, model, token, lastSeen, log }) =>
        ({ key, app, model, token, online: at - lastSeen < ONLINE_MS, log: log.slice(0, 60) })),
      calls: [...calls.values()].reverse().map((call) => ({ ...call,
        status: call.status === 'sent' && at > call.expiresAtMs ? 'expired' : call.status })),
    };
  }

  return { report, invite, signal, snapshot };
}

function findServiceAccount(directory) {
  try {
    const file = readdirSync(directory).find((name) => /(adminsdk|service-account).*\.json$/.test(name));
    return file && join(directory, file);
  } catch { return undefined; }
}

const run = promisify(execFile);
async function reverse(ports) {
  try {
    const { stdout } = await run('adb', ['devices']);
    const serials = stdout.split('\n').slice(1).map((line) => line.split('\t')).filter(([, state]) => state === 'device').map(([serial]) => serial);
    await Promise.all(serials.flatMap((serial) => ports.map((port) =>
      run('adb', ['-s', serial, 'reverse', `tcp:${port}`, `tcp:${port}`]))));
    return serials.length ? `adb reverse on ${serials.join(', ')}` : 'no device connected over adb';
  } catch (error) {
    return `adb unavailable: ${error.code === 'ENOENT' ? 'not on PATH' : error.message.split('\n')[0]}`;
  }
}

async function body(request) {
  let text = '';
  for await (const chunk of request) { text += chunk; if (text.length > 1_000_000) throw new Error('Body too large.'); }
  return text ? JSON.parse(text) : {};
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const option = (name) => { const index = args.indexOf(`--${name}`); return index < 0 ? undefined : args[index + 1]; };
  const port = Number(option('port') ?? 8787);
  // 0.0.0.0 lets an iPhone on the same network reach the console; the default stays local.
  const host = option('host') ?? '127.0.0.1';
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const serviceAccount = option('service-account') ?? findServiceAccount(join(root, 'packages/secrets'));
  const page = await import('./call-console-page.mjs').then((module) => module.page);
  const console_ = createConsole({ send: (options) => {
    if (!serviceAccount) throw new Error('No service account. Put the Firebase private key JSON in packages/secrets/ or pass --service-account.');
    return sendAndroid({ ...options, serviceAccount });
  } });
  const liveKit = { url: option('livekit-url') ?? 'ws://127.0.0.1:7880',
    key: option('livekit-key') ?? 'devkey', secret: option('livekit-secret') ?? 'secret' };
  // 7880 is LiveKit signaling and 7881 its ICE/TCP port: media from a device reaches it over adb.
  const reversed = [port, ...(/^wss?:\/\/127\.0\.0\.1:7880$/.test(liveKit.url) ? [7880, 7881] : [])];
  let adb = await reverse(reversed);
  setInterval(async () => { adb = await reverse(reversed); }, 5000).unref();

  const routes = {
    'GET /': (_, response) => response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(page),
    'GET /api/state': () => ({ ...console_.snapshot(), serviceAccount: serviceAccount ?? null, adb, liveKitUrl: liveKit.url }),
    // A real backend issues these after authenticating the user and checking call membership.
    // The adapter sends only the call ID; a real backend takes the identity from the session.
    'POST /api/media-token': ({ callId, identity = 'callee', name }, _, request) => {
      if (!callId) throw new Error('callId is required.');
      return { url: liveKitUrlFor(liveKit.url, request.headers.host),
        token: liveKitToken({ ...liveKit, room: `call-${callId}`, identity, name }) };
    },
    'POST /api/device': (payload) => { console_.report(payload); return {}; },
    'POST /api/invite': (payload) => console_.invite(payload),
    'POST /api/signal': (payload) => console_.signal(payload),
  };
  createServer(async (request, response) => {
    const route = routes[`${request.method} ${request.url}`];
    if (!route) return response.writeHead(404).end();
    try {
      const result = await route(request.method === 'POST' ? await body(request) : undefined, response, request);
      if (!response.headersSent) response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(result));
    } catch (error) {
      response.writeHead(400, { 'content-type': 'application/json' }).end(JSON.stringify({ error: error.message }));
    }
  }).listen(port, host, () => {
    console.log(`Callx call console: http://127.0.0.1:${port}`);
    if (host !== '127.0.0.1') {
      const lan = Object.values(networkInterfaces()).flat().find((item) => item?.family === 'IPv4' && !item.internal)?.address;
      console.log(`Listening on ${host}: an iPhone uses http://${lan ?? '<this Mac>'}:${port} as CallxConsoleURL.`);
      console.log('No authentication: anyone on this network can send pushes through this console.');
    }
    console.log(`Service account: ${serviceAccount ?? 'none (invites disabled)'}`);
    console.log(adb);
  });
}
