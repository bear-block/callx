// Sends Callx pushes through FCM HTTP v1 (Android) and APNs (iOS VoIP), with node:crypto only.
// Without credentials for a platform, it logs the push instead of sending it.
import { createPrivateKey, sign } from 'node:crypto';
import { connect } from 'node:http2';

const base64url = (value) => Buffer.from(value).toString('base64url');
function jwt(header, claims, signer) {
  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claims))}`;
  return `${unsigned}.${signer(Buffer.from(unsigned)).toString('base64url')}`;
}

/** The FCM v1 message: the Callx payload is JSON in one string under `data.callx`. */
export function fcmMessage(token, payload, priority, nowMs = Date.now()) {
  // An invitation may wait in FCM until it expires, so a short network gap does not lose it.
  // A zero TTL would drop it whenever the phone is not connected at that instant.
  const ttlSeconds = payload.expiresAtMs ? Math.max(1, Math.ceil((payload.expiresAtMs - nowMs) / 1000)) : 30;
  return { message: { token, android: { priority: priority === 'high' ? 'HIGH' : 'NORMAL', ttl: `${ttlSeconds}s` },
    data: { callx: JSON.stringify(payload) } } };
}

export function createPush({ firebase, apns, log = console.log }) {
  let google; // {accessToken, expiresAtMs}
  let apple;  // {token, issuedAtMs}

  async function googleAccessToken() {
    if (google && google.expiresAtMs > Date.now() + 60_000) return google.accessToken;
    const now = Math.floor(Date.now() / 1000);
    const assertion = jwt({ alg: 'RS256', typ: 'JWT' }, {
      iss: firebase.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
    }, (data) => sign('RSA-SHA256', data, createPrivateKey(firebase.private_key)));
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
    });
    const body = await response.json();
    if (!body.access_token) throw new Error(`Google OAuth failed: ${body.error_description ?? response.status}`);
    google = { accessToken: body.access_token, expiresAtMs: Date.now() + body.expires_in * 1000 };
    return google.accessToken;
  }

  function appleProviderToken() {
    // APNs accepts a provider token for up to an hour and refuses one renewed too often.
    if (apple && apple.issuedAtMs > Date.now() - 50 * 60_000) return apple.token;
    const token = jwt({ alg: 'ES256', kid: apns.keyId }, { iss: apns.teamId, iat: Math.floor(Date.now() / 1000) },
      (data) => sign('sha256', data, { key: createPrivateKey(apns.key), dsaEncoding: 'ieee-p1363' }));
    apple = { token, issuedAtMs: Date.now() };
    return token;
  }

  async function sendFcm(token, payload, priority) {
    const response = await fetch(`https://fcm.googleapis.com/v1/projects/${firebase.project_id}/messages:send`, {
      method: 'POST',
      headers: { authorization: `Bearer ${await googleAccessToken()}`, 'content-type': 'application/json' },
      body: JSON.stringify(fcmMessage(token, payload, priority)),
    });
    // 404 UNREGISTERED: the app was uninstalled or the token rotated. APNs says 410.
    return { status: response.status, invalidToken: response.status === 404 };
  }

  function sendApns(token, payload) {
    const host = apns.production ? 'https://api.push.apple.com' : 'https://api.sandbox.push.apple.com';
    return new Promise((resolve, reject) => {
      const session = connect(host);
      session.on('error', reject);
      const request = session.request({
        ':method': 'POST', ':path': `/3/device/${token}`,
        authorization: `bearer ${appleProviderToken()}`,
        'apns-push-type': 'voip', 'apns-topic': `${apns.bundleId}.voip`,
        'apns-priority': '10', 'apns-expiration': '0', 'content-type': 'application/json',
      });
      let status = 0;
      request.on('response', (headers) => { status = headers[':status']; });
      request.on('data', () => {});
      request.on('end', () => { session.close(); resolve({ status, invalidToken: status === 410 }); });
      request.on('error', reject);
      request.end(JSON.stringify({ aps: {}, callx: payload }));
    });
  }

  /** Sends one push. Resolves with `invalidToken: true` when the token should be removed. */
  return async function send({ installation, payload, priority }) {
    const { type, token } = installation;
    const label = `${payload.type} → ${installation.userId}/${installation.installationId} (${type}, ${priority})`;
    if (type === 'voip' && priority !== 'high') return { skipped: true }; // every VoIP push must ring
    if ((type === 'fcm' && !firebase) || (type === 'voip' && !apns)) {
      log(`[push, not sent: no ${type === 'fcm' ? 'Firebase' : 'APNs'} credentials] ${label} ${JSON.stringify(payload)}`);
      return { skipped: true };
    }
    const result = type === 'fcm' ? await sendFcm(token, payload, priority) : await sendApns(token, payload);
    log(`[push ${result.status}] ${label}`);
    return result;
  };
}
