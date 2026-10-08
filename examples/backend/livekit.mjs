// A LiveKit access token, signed with node:crypto. In your own backend you can use
// livekit-server-sdk's AccessToken instead; the claims are the same.
import { createHmac } from 'node:crypto';

/** A short-lived token that lets `identity` join `room` and publish and subscribe audio and video. */
export function liveKitToken({ apiKey, apiSecret, room, identity, ttlSeconds = 600, nowSeconds = Math.floor(Date.now() / 1000) }) {
  const part = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const unsigned = `${part({ alg: 'HS256', typ: 'JWT' })}.${part({
    iss: apiKey, sub: identity, nbf: nowSeconds, exp: nowSeconds + ttlSeconds,
    video: { room, roomJoin: true, canPublish: true, canSubscribe: true },
  })}`;
  return `${unsigned}.${createHmac('sha256', apiSecret).update(unsigned).digest('base64url')}`;
}
