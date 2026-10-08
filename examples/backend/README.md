# Callx example backend

A runnable backend for the [Get started](https://bear-block.github.io/callx/guide/) call
service: about 450 lines of Node 22, comments included, no dependencies. It does everything a Callx app needs from
a server, and nothing else:

| Route | Does |
|---|---|
| `PUT /v1/installations/{id}/push-token` | Stores `{type, token}` from `getPushToken()` / `pushToken()` for the signed-in user |
| `DELETE /v1/installations/{id}/push-token` | Forgets it, on sign-out |
| `POST /v1/calls` | `{callId, calleeUserId, video?}`: stores the call as ringing and pushes the invitation to every callee device |
| `POST /v1/media-token` | The LiveKit adapter's `tokenUrl`. For the callee, the first request wins the answer: the caller gets `call.accepted`, the callee's other devices `call.ended` (`answeredElsewhere`) |
| `POST /v1/calls/{id}/end` | `{reason}` from the phone that ended (`localHangup`, `declined`, `unanswered`, `busy`, `failed`); the other side gets `call.ended` |
| `GET /v1/calls/{id}` | The call's current state, including ended calls |
| `GET /v1/call-events?cursor=N&wait=25` | Long poll for this installation's `call.accepted` and `call.ended` events |

Calls still ringing at their expiry (30 seconds) end as `unanswered` on both sides. When a
ringing call ends, Android devices also get a normal-priority FCM signal, so a phone whose app
is not running stops ringing too.

Why each rule exists is on the [Backend overview](https://bear-block.github.io/callx/backend/).

## Run it

```sh
node examples/backend/server.mjs          # or: npm run example:backend
```

Without credentials it logs each push instead of sending it, which is enough to try the API.
To ring real phones:

```sh
FIREBASE_SERVICE_ACCOUNT=~/secrets/firebase-adminsdk.json \
APNS_KEY_FILE=~/secrets/AuthKey_ABC123.p8 APNS_KEY_ID=ABC123 APNS_TEAM_ID=TEAM123 \
APNS_BUNDLE_ID=com.example.calls \
HOST=0.0.0.0 node examples/backend/server.mjs
```

For audio, run a local LiveKit server; its development keys are the defaults here:

```sh
docker run --rm -p 7880:7880 -p 7881:7881 -p 7882:7882/udp \
  livekit/livekit-server --dev --bind 0.0.0.0
```

An Android device reaches both through `adb reverse tcp:8080 tcp:8080` and
`adb reverse tcp:7880 tcp:7880`. An iPhone uses your computer's address: start the server with
`HOST=0.0.0.0` and set `LIVEKIT_URL=ws://<your computer's IP>:7880`.

| Variable | Default |
|---|---|
| `PORT`, `HOST` | `8080`, `127.0.0.1` |
| `FIREBASE_SERVICE_ACCOUNT` | none: Android pushes are logged |
| `APNS_KEY_FILE`, `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_BUNDLE_ID` | none: iOS pushes are logged |
| `APNS_PRODUCTION` | unset: the APNs sandbox, for development builds. `1` for TestFlight and App Store |
| `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | `ws://127.0.0.1:7880`, `devkey`, `secret` |
| `RING_SECONDS` | `30` |

> [!WARNING]
> **Example authentication.** The server trusts `authorization: Bearer <userId>` as the user's
> identity, so anyone can be anyone. Replace `authenticate` in `server.mjs` with your session
> check before the server leaves your machine. State is in memory and lost on restart.

## Connect the app

The quick start's `calls.ts` imports `api`, `signaling` and `newUuid` from `./backend`. This is
that file for this server:

```ts
// backend.ts
import type {EndReason} from '@bear-block/callx';

export const BASE_URL = 'http://127.0.0.1:8080'; // adb reverse; your computer's IP for an iPhone

let session = {userId: '', installationId: ''};
/** Call after sign-in. installationId: a UUID you generate once per install and keep. */
export function signIn(userId: string, installationId: string) {
  session = {userId, installationId};
}

async function request(method: string, path: string, body?: object) {
  const response = await fetch(BASE_URL + path, {
    method,
    headers: {
      authorization: `Bearer ${session.userId}`,
      'x-installation-id': session.installationId,
      'content-type': 'application/json',
    },
    body: body && JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${method} ${path}: ${response.status}`);
  return response.status === 204 ? null : response.json();
}

export const api = {
  registerPushToken: (type: string, token: string) =>
    request('PUT', `/v1/installations/${session.installationId}/push-token`, {type, token}),
  createCall: (call: {callId: string; calleeUserId: string; video?: boolean}) =>
    request('POST', '/v1/calls', call),
  endCall: (callId: string, reason?: string) => request('POST', `/v1/calls/${callId}/end`, {reason}),
};

/** Headers for configureLiveKit: the installation lets the token request claim the answer. */
export const liveKitConfig = () => ({
  tokenUrl: `${BASE_URL}/v1/media-token`,
  headers: {authorization: `Bearer ${session.userId}`, 'x-installation-id': session.installationId},
});

type CallEvent = {eventId: string; type: string; callId: string; reason?: EndReason};
const handlers = new Map<string, (event: CallEvent) => void>();
export const signaling = {
  on: (type: string, handler: (event: CallEvent) => void) => void handlers.set(type, handler),
};

/** Reads call events while the app runs. Start it after signIn. */
export async function startSignaling() {
  let cursor = 0;
  const seen = new Set<string>();
  for (;;) {
    try {
      const page = await request('GET', `/v1/call-events?cursor=${cursor}&wait=25`);
      cursor = page.cursor;
      for (const event of page.events as CallEvent[]) {
        if (seen.has(event.eventId)) continue;
        seen.add(event.eventId);
        handlers.get(event.type)?.(event);
      }
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 2000)); // offline: retry
    }
  }
}

/** Any UUID v4 generator works; use a library such as `uuid` in production. */
export const newUuid = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
```

In Flutter, the same requests with `package:http` make the `api`, `signaling` and
`liveKitConfig` that `calls.dart` uses.

## Try it without an app

```sh
H='content-type: application/json'
curl -X PUT localhost:8080/v1/installations/bob-phone/push-token \
  -H 'authorization: Bearer bob' -H "$H" -d '{"type":"fcm","token":"<Bob FCM token>"}'
curl -X POST localhost:8080/v1/calls -H 'authorization: Bearer alice' \
  -H 'x-installation-id: alice-laptop' -H "$H" -d "{\"callId\":\"$(uuidgen)\",\"calleeUserId\":\"bob\"}"
```

Bob's phone rings. Read Alice's events with
`curl 'localhost:8080/v1/call-events?wait=25' -H 'authorization: Bearer alice' -H 'x-installation-id: alice-laptop'`.

## Before production

This example keeps the rules and leaves out the infrastructure. A production backend adds:

- Real authentication, and authorization of call membership from the session.
- A database, with each change and its events written in one transaction (an outbox), and a
  worker that sends pushes with retries.
- Expiry timers that survive restarts, and a WebSocket or your existing realtime channel
  instead of long polling.
- The [production checklist](https://bear-block.github.io/callx/backend/production).

`npm test` in this folder runs the call rules and one HTTP round trip.
