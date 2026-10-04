#!/usr/bin/env node
// Sends Callx test pushes for device trials of the example apps.
//
//   Android invitation:
//     callx-push android --service-account ~/secrets/firebase-sa.json --token <FCM token>
//   Android test signals (the example stands in for a signaling socket with FCM data):
//     callx-push android ... --message end --call-id <id> [--reason callerCancelled]
//     callx-push android ... --message accept --call-id <id>
//   iOS invitation (VoIP push; cancel with the example's "Caller cancels" button):
//     callx-push ios --key AuthKey_ABC123.p8 --key-id ABC123 --team-id TEAM123 \
//       --bundle-id dev.callx.preview.callxFlutterExample --token <VoIP token> [--production]
//
// Common options: --call-id, --name, --handle, --expires-in <seconds> (default 30), --video, --dry-run.
// Keep credentials outside the repository; nothing here stores them.
import { createPrivateKey, randomUUID, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { connect } from 'node:http2';
import { isMain } from './main.mjs';

export function parseArguments(argv) {
  const [platform, ...rest] = argv;
  const options = { platform };
  for (let index = 0; index < rest.length; index++) {
    const key = rest[index];
    if (!key.startsWith('--')) throw new Error(`Unexpected argument: ${key}`);
    const name = key.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    const next = rest[index + 1];
    if (next === undefined || next.startsWith('--')) options[name] = true;
    else { options[name] = next; index++; }
  }
  if (!['android', 'ios'].includes(platform)) throw new Error('First argument must be android or ios.');
  if (!options.token) throw new Error('--token is required.');
  return options;
}

export function invitation(options, nowMs = Date.now()) {
  const expiresIn = Number(options.expiresIn ?? 30);
  return {
    schemaVersion: 1,
    eventId: `evt-${randomUUID()}`,
    type: 'call.invited',
    callId: options.callId ?? randomUUID(),
    revision: '1',
    displayName: options.name ?? 'hao.dev7',
    handle: options.handle ?? 'callx:test-caller',
    issuedAtMs: nowMs,
    expiresAtMs: nowMs + expiresIn * 1000,
    ...(options.video ? { video: true } : {}),
  };
}

const base64url = (value) => Buffer.from(value).toString('base64url');
function jwt(header, claims, signer) {
  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claims))}`;
  return `${unsigned}.${signer(Buffer.from(unsigned)).toString('base64url')}`;
}

export function fcmAssertion(account, nowSeconds = Math.floor(Date.now() / 1000)) {
  return jwt({ alg: 'RS256', typ: 'JWT' }, {
    iss: account.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: nowSeconds,
    exp: nowSeconds + 3600,
  }, (data) => sign('RSA-SHA256', data, createPrivateKey(account.private_key)));
}

export function fcmMessage(options, payload) {
  const message = options.message ?? 'invite';
  let data;
  if (message === 'invite') data = { callx: JSON.stringify(payload) };
  else if (message === 'end' || message === 'accept') {
    if (!options.callId) throw new Error(`--message ${message} needs --call-id.`);
    // The production format (ADR-0014): Callx 3.0.1+ applies it natively, even to a killed app.
    data = { callx: JSON.stringify(message === 'end'
      ? { schemaVersion: 1, type: 'call.ended', callId: options.callId, reason: options.reason ?? 'remoteEnded' }
      : { schemaVersion: 1, type: 'call.accepted', callId: options.callId }) };
  } else throw new Error('--message must be invite, end or accept.');
  // Only a visible invitation warrants high priority. Signals make no notification.
  // The TTL lets FCM hold a message while the device's connection is down (a fresh boot, Doze,
  // a network switch). An invitation lives until it expires, since the core ignores it after
  // that; a zero TTL drops it whenever the device is not connected at that very moment.
  const ttlSeconds = message === 'invite'
    ? Math.max(0, Math.ceil((payload.expiresAtMs - payload.issuedAtMs) / 1000)) : 30;
  return { message: { token: options.token,
    android: { priority: message === 'invite' ? 'HIGH' : 'NORMAL', ttl: `${ttlSeconds}s` }, data } };
}

export function apnsToken(keyPem, keyId, teamId, nowSeconds = Math.floor(Date.now() / 1000)) {
  return jwt({ alg: 'ES256', kid: keyId }, { iss: teamId, iat: nowSeconds },
    (data) => sign('sha256', data, { key: createPrivateKey(keyPem), dsaEncoding: 'ieee-p1363' }));
}

export async function sendAndroid(options) {
  if (!options.serviceAccount) throw new Error('--service-account is required for android.');
  const account = JSON.parse(readFileSync(options.serviceAccount, 'utf8'));
  const payload = invitation(options);
  const body = fcmMessage(options, payload);
  const assertion = fcmAssertion(account);
  if (options.dryRun) return { dryRun: true, project: account.project_id, body, assertionParts: assertion.split('.').length };
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  const { access_token: accessToken, error_description: tokenError } = await tokenResponse.json();
  if (!accessToken) throw new Error(`OAuth token request failed: ${tokenError ?? tokenResponse.status}`);
  const response = await fetch(`https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`, {
    method: 'POST',
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: response.status, response: await response.json(), callId: options.callId ?? payload.callId };
}

async function sendIos(options) {
  for (const key of ['key', 'keyId', 'teamId', 'bundleId']) {
    if (!options[key]) throw new Error(`--${key.replace(/[A-Z]/g, (l) => `-${l.toLowerCase()}`)} is required for ios.`);
  }
  if (options.message && options.message !== 'invite') {
    throw new Error('iOS VoIP pushes carry invitations only; end the call with the example UI.');
  }
  const payload = invitation(options);
  const host = options.production ? 'api.push.apple.com' : 'api.sandbox.push.apple.com';
  const headers = {
    ':method': 'POST',
    ':path': `/3/device/${options.token}`,
    authorization: `bearer ${apnsToken(readFileSync(options.key, 'utf8'), options.keyId, options.teamId)}`,
    'apns-push-type': 'voip',
    'apns-topic': `${options.bundleId}.voip`,
    'apns-priority': '10',
    'apns-expiration': '0',
    'content-type': 'application/json',
  };
  const body = JSON.stringify({ aps: {}, callx: payload });
  if (options.dryRun) return { dryRun: true, host, headers: { ...headers, authorization: 'bearer <redacted>' }, body: JSON.parse(body) };
  return await new Promise((resolve, reject) => {
    const session = connect(`https://${host}`);
    session.on('error', reject);
    const request = session.request(headers);
    let status; let text = '';
    request.on('response', (response) => { status = response[':status']; });
    request.on('data', (chunk) => { text += chunk; });
    request.on('end', () => { session.close(); resolve({ status, response: text || null, callId: payload.callId }); });
    request.on('error', reject);
    request.end(body);
  });
}

if (isMain(import.meta.url)) {
  try {
    const options = parseArguments(process.argv.slice(2));
    const result = options.platform === 'android' ? await sendAndroid(options) : await sendIos(options);
    console.log(JSON.stringify(result, null, 2));
    if (!result.dryRun && result.status !== 200) process.exitCode = 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
