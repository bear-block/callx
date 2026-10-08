---
title: "Example backend"
description: "A runnable Node backend for Callx: push invitations, answer arbitration through the LiveKit token request, hang-ups, expiry and call events."
---

<!--@include: ../../examples/backend/README.md-->

## Source

[`examples/backend`](https://github.com/bear-block/callx/tree/main/examples/backend) in the
repository: `calls.mjs` holds the call rules, `server.mjs` the routes, `push.mjs` the FCM and
APNs requests and `livekit.mjs` the room token.
