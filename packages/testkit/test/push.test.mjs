import assert from 'node:assert/strict';
import { generateKeyPairSync, verify } from 'node:crypto';
import test from 'node:test';
import { apnsToken, fcmAssertion, fcmMessage, invitation, parseArguments } from '../src/push.mjs';

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const parts = (token) => token.split('.');
const json = (part) => JSON.parse(Buffer.from(part, 'base64url').toString());

test('invitation matches call.invited schema v1', () => {
  const payload = invitation({ name: 'hao.dev7', expiresIn: '10' }, 1_000);
  assert.equal(payload.schemaVersion, 1);
  assert.equal(payload.type, 'call.invited');
  assert.match(payload.callId, ID);
  assert.match(payload.eventId, ID);
  assert.equal(payload.revision, '1');
  assert.equal(payload.expiresAtMs, 11_000);
  assert.equal(invitation({ callId: 'call-7' }).callId, 'call-7');
});

test('FCM invitation is data-only, high priority, and lives until it expires', () => {
  const payload = invitation({});
  const { message } = fcmMessage({ token: 't' }, payload);
  assert.deepEqual(message.android, { priority: 'HIGH', ttl: '30s' });
  assert.equal(fcmMessage({ token: 't' }, invitation({ expiresIn: 45 })).message.android.ttl, '45s');
  assert.deepEqual(JSON.parse(message.data.callx), payload);
  assert.equal(message.notification, undefined);
});

test('FCM test signals need a call ID', () => {
  assert.throws(() => fcmMessage({ token: 't', message: 'end' }, invitation({})), /--call-id/);
  const { message } = fcmMessage({ token: 't', message: 'end', callId: 'c1', reason: 'callerCancelled' }, invitation({}));
  assert.deepEqual(message.android, { priority: 'NORMAL', ttl: '30s' });
  assert.deepEqual(JSON.parse(message.data.callx), { schemaVersion: 1, type: 'call.ended', callId: 'c1', reason: 'callerCancelled' });
  assert.equal(fcmMessage({ token: 't', message: 'accept', callId: 'c1' }, invitation({})).message.android.priority, 'NORMAL');
  assert.throws(() => fcmMessage({ token: 't', message: 'ring' }, invitation({})), /must be invite/);
});

test('FCM OAuth assertion is RS256 signed by the service account', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const account = { client_email: 'sa@example.iam.gserviceaccount.com',
    private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) };
  const [header, claims, signature] = parts(fcmAssertion(account, 100));
  assert.equal(json(header).alg, 'RS256');
  assert.equal(json(claims).scope, 'https://www.googleapis.com/auth/firebase.messaging');
  assert.equal(json(claims).exp, 3_700);
  assert.ok(verify('RSA-SHA256', Buffer.from(`${header}.${claims}`), publicKey, Buffer.from(signature, 'base64url')));
});

test('APNs provider token is ES256 in raw (r||s) form', () => {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const token = apnsToken(privateKey.export({ type: 'pkcs8', format: 'pem' }), 'KEY123', 'TEAM123', 200);
  const [header, claims, signature] = parts(token);
  assert.deepEqual(json(header), { alg: 'ES256', kid: 'KEY123' });
  assert.deepEqual(json(claims), { iss: 'TEAM123', iat: 200 });
  assert.equal(Buffer.from(signature, 'base64url').length, 64);
  assert.ok(verify('sha256', Buffer.from(`${header}.${claims}`), { key: publicKey, dsaEncoding: 'ieee-p1363' },
    Buffer.from(signature, 'base64url')));
});

test('arguments are parsed and validated', () => {
  assert.deepEqual(parseArguments(['android', '--token', 'abc', '--dry-run', '--call-id', 'c1']),
    { platform: 'android', token: 'abc', dryRun: true, callId: 'c1' });
  assert.throws(() => parseArguments(['web', '--token', 'x']), /android or ios/);
  assert.throws(() => parseArguments(['ios']), /--token/);
});

test('a video invitation carries video: true; an audio one leaves it out', () => {
  assert.equal(invitation({ video: true }).video, true);
  assert.equal('video' in invitation({}), false);
});
