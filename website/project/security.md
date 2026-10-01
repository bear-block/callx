---
title: "Security"
description: "How to report a vulnerability, and how Callx handles credentials, payloads and privacy."
---

# Security

## Reporting a vulnerability

Please report security issues privately through
[GitHub security advisories](https://github.com/bear-block/callx/security/advisories/new). Do not
open a public issue. You will get an acknowledgement within a few days, and credit in the release
notes if you wish.

Supported versions: the latest minor release.

## How Callx handles sensitive data

| Data | Handling |
|---|---|
| Push tokens | Kept in memory for `getPushToken()`; never logged, never sent anywhere by Callx |
| Invitation payloads | Decoded natively; not logged. Display names and handles are not included in error messages |
| Call state checkpoint | App-private storage, one file per account generation |
| LiveKit credential headers | Encrypted with the Android Keystore (AES-GCM) and the iOS keychain (after first unlock); dropped from restored backups |
| Telemetry | None. The library makes no network requests of its own |

## Your responsibilities

- Keep APNs keys and Firebase service accounts on your server. Apps must contain no provider
  private keys.
- Authenticate every backend request and authorize call membership; never trust user IDs in
  request bodies.
- Issue short-lived, participant-scoped media credentials, and never put them in push payloads.
- Unregister push tokens on sign-out.
- Rotate `accountGeneration` on sign-out so the next account never sees the previous one's
  state.

## Testkit

`@bear-block/callx-testkit` is for development. Its console has no authentication and listens
on `127.0.0.1` by default. Never expose it to the internet or ship it in an app.
