# @bear-block/callx-testkit

Device-trial tools for callx and its media adapters. Test harness only: the console has no
authentication and listens on 127.0.0.1 unless told otherwise.

| Command | What it does |
|---|---|
| `callx-console` | A local call server: sends FCM invitations, answers and ends calls as the remote side, issues LiveKit tokens, joins a call's audio as the caller from the browser, and follows each call from the device log |
| `callx-push` | Sends one FCM or APNs VoIP test push |
| `callx-conformance android` | Runs the media adapter conformance scenario on a device or emulator and exits non-zero on any failure |

## Call console

```sh
callx-console [--service-account <firebase-adminsdk.json>] [--port 8787] [--host 0.0.0.0]
```

The service account comes from `--service-account`, `CALLX_SERVICE_ACCOUNT`, or the first
`*adminsdk*.json` in `./packages/secrets`. Debug builds of the callx examples report their push
token and host log to it; the console keeps `adb reverse` set for connected Android devices.
With `--host 0.0.0.0`, an iPhone on the same network reaches it at the Mac's address, and
LiveKit URLs are rewritten to that address.

Media needs a LiveKit server with the `--dev` keys (`devkey`/`secret`) on port 7880, for
example `docker run --rm -p 7880:7880 -p 7881:7881 -p 7882:7882/udp
livekit/livekit-server:v1.13.7 --dev --bind 0.0.0.0 --node-ip 127.0.0.1`. The console's
`POST /api/media-token` follows the adapter's token contract: `{"callId"}` in,
`{"url","token"}` out.

## Conformance

```sh
callx-conformance android [--device <adb serial>] [--console http://127.0.0.1:8787] [--package dev.bearblock.callx]
```

With the console and LiveKit running, and the app installed with the microphone allowed:

1. The console invites the first online device through FCM; headless Chrome joins as the caller.
2. The device rings; the test answers from the notification shade.
3. Media connects (`mediaConnected`).
4. The caller leaves: the device reports interrupted media and the call stays active.
5. The caller returns: media reconnects.
6. The remote side ends the call.
7. Logcat shows no crash of the app process.

Chrome is found at its macOS path or `CHROME`. Every media adapter passes this on an Android
device before release ([ADR-0009](../../docs/adr/0009-core-and-media-adapter-packages.md)). iOS
conformance needs an iPhone, because the Simulator ends CallKit calls at once; it is manual
for now.
