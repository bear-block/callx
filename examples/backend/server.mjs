#!/usr/bin/env node
// A runnable Callx backend: push tokens, call creation and invitations, answer arbitration
// through the LiveKit token request, hang-ups, ring expiry, and a long-poll event stream the
// apps read `call.accepted` and `call.ended` from. Node 22 or later, no dependencies.
//
//   node server.mjs
//
// Configuration (environment variables, all optional):
//   PORT, HOST                     default 8080 on 127.0.0.1
//   FIREBASE_SERVICE_ACCOUNT       path to a Firebase service-account JSON (Android pushes)
//   APNS_KEY_FILE, APNS_KEY_ID,    an APNs auth key (.p8) and its IDs (iOS VoIP pushes);
//   APNS_TEAM_ID, APNS_BUNDLE_ID,  APNS_PRODUCTION=1 for TestFlight and App Store builds
//   LIVEKIT_URL, LIVEKIT_API_KEY,  default ws://127.0.0.1:7880 with devkey/secret, the
//   LIVEKIT_API_SECRET             `livekit-server --dev` credentials
//   RING_SECONDS                   how long an invitation rings, default 30
//
// EXAMPLE AUTHENTICATION ONLY: `authorization: Bearer <userId>` is trusted as the user's ID.
// Replace `authenticate` with your session check before anything leaves your laptop.
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { createCalls, HttpError } from './calls.mjs';
import { liveKitToken } from './livekit.mjs';
import { createPush } from './push.mjs';

function authenticate(request) {
  const userId = /^Bearer (.+)$/.exec(request.headers.authorization ?? '')?.[1];
  if (!userId) throw new HttpError(401, 'Send authorization: Bearer <userId>.');
  return userId;
}

function installationOf(request) {
  const id = request.headers['x-installation-id'];
  if (!id) throw new HttpError(400, 'Send x-installation-id: a stable ID for this app installation.');
  return id;
}

async function readJson(request) {
  let body = '';
  for await (const chunk of request) body += chunk;
  try { return body ? JSON.parse(body) : {}; } catch { throw new HttpError(400, 'The body is not JSON.'); }
}

export function createBackend({ push, livekit, ringMs = 30_000, now = Date.now, log = console.log }) {
  const calls = createCalls({
    now, ringMs,
    schedule: (atMs, fn) => setTimeout(fn, Math.max(0, atMs - now())).unref(),
    push: (message) => {
      push(message)
        .then((result) => { if (result?.invalidToken) calls.removeInstallation(message.installation.installationId); })
        .catch((error) => log(`[push failed] ${error.message}`));
    },
  });

  const routes = [
    ['PUT', /^\/v1\/installations\/([^/]+)\/push-token$/, async (request, userId, [installationId]) => {
      const { type, token } = await readJson(request);
      calls.registerPushToken(userId, installationId, type, token);
      return [204];
    }],
    ['DELETE', /^\/v1\/installations\/([^/]+)\/push-token$/, async (request, userId, [installationId]) => {
      calls.removeInstallation(installationId, userId); // on sign-out
      return [204];
    }],
    ['POST', /^\/v1\/calls$/, async (request, userId) => {
      return [201, calls.createCall(userId, installationOf(request), await readJson(request))];
    }],
    ['GET', /^\/v1\/calls\/([^/]+)$/, async (request, userId, [callId]) => [200, calls.getCall(userId, callId)]],
    ['POST', /^\/v1\/calls\/([^/]+)\/end$/, async (request, userId, [callId]) => {
      const { reason } = await readJson(request);
      return [200, calls.endCall(userId, installationOf(request), callId, reason)];
    }],
    // The LiveKit adapter's tokenUrl. For the callee this request is also the answer.
    ['POST', /^\/v1\/media-token$/, async (request, userId) => {
      const { callId } = await readJson(request);
      const { room, identity } = calls.claimMedia(userId, installationOf(request), callId);
      return [200, { url: livekit.url, token: liveKitToken({ ...livekit, room, identity }) }];
    }],
    // Long poll: answers at once when events are waiting, otherwise after one arrives or `wait` seconds.
    ['GET', /^\/v1\/call-events$/, async (request, userId, params, url, response) => {
      const installationId = installationOf(request);
      const cursor = Number(url.searchParams.get('cursor') ?? 0);
      const waitMs = Math.min(Number(url.searchParams.get('wait') ?? 25), 25) * 1000;
      let result = calls.eventsFor(installationId, cursor);
      if (result.events.length === 0 && waitMs > 0) {
        await new Promise((resolve) => {
          const timer = setTimeout(done, waitMs);
          const unsubscribe = calls.subscribe(installationId, done);
          response.on('close', done); // the app went away
          function done() { clearTimeout(timer); unsubscribe(); resolve(); }
        });
        result = calls.eventsFor(installationId, cursor);
      }
      return [200, result];
    }],
  ];

  const server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost');
    try {
      const route = routes.find(([method, pattern]) => method === request.method && pattern.test(url.pathname));
      if (!route) throw new HttpError(404, 'Not found.');
      const userId = authenticate(request);
      const [status, body] = await route[2](request, userId, route[1].exec(url.pathname).slice(1), url, response);
      response.writeHead(status, body ? { 'content-type': 'application/json' } : {});
      response.end(body ? JSON.stringify(body) : undefined);
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500;
      if (status === 500) log(error.stack);
      response.writeHead(status, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: error.message }));
    }
  });
  return { server, calls };
}

function configFromEnvironment(env) {
  const apnsReady = env.APNS_KEY_FILE && env.APNS_KEY_ID && env.APNS_TEAM_ID && env.APNS_BUNDLE_ID;
  return {
    port: Number(env.PORT ?? 8080),
    host: env.HOST ?? '127.0.0.1',
    ringMs: Number(env.RING_SECONDS ?? 30) * 1000,
    firebase: env.FIREBASE_SERVICE_ACCOUNT ? JSON.parse(readFileSync(env.FIREBASE_SERVICE_ACCOUNT, 'utf8')) : undefined,
    apns: apnsReady ? { key: readFileSync(env.APNS_KEY_FILE, 'utf8'), keyId: env.APNS_KEY_ID, teamId: env.APNS_TEAM_ID,
      bundleId: env.APNS_BUNDLE_ID, production: env.APNS_PRODUCTION === '1' } : undefined,
    livekit: { url: env.LIVEKIT_URL ?? 'ws://127.0.0.1:7880', apiKey: env.LIVEKIT_API_KEY ?? 'devkey',
      apiSecret: env.LIVEKIT_API_SECRET ?? 'secret' },
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const config = configFromEnvironment(process.env);
  const { server } = createBackend({ ...config, push: createPush(config) });
  server.listen(config.port, config.host, () => {
    console.log(`Callx example backend on http://${config.host}:${config.port}`);
    console.log(`  Android pushes: ${config.firebase ? `Firebase project ${config.firebase.project_id}` : 'logged, not sent (set FIREBASE_SERVICE_ACCOUNT)'}`);
    console.log(`  iOS pushes:     ${config.apns ? `APNs ${config.apns.production ? 'production' : 'sandbox'}` : 'logged, not sent (set APNS_*)'}`);
    console.log(`  LiveKit:        ${config.livekit.url}`);
  });
}
