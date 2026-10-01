---
title: "Recovery"
description: "What Callx does after a crash, a kill, a reload or an account switch, and what it deliberately does not try to do."
---

# Recovery

Phones kill processes. Engines reload. Users switch accounts. Callx is designed so that none of
these leaves a call in a state your app cannot explain.

## Engine reloads

A Flutter hot restart or a React Native reload does not touch the native core. The call keeps
ringing or running, every action keeps being recorded, and your UI reattaches with
`openSession()` or a new snapshot observer. Nothing is replayed twice and nothing is lost.

## Process death

When the process dies with a call in progress (a crash, the OS reclaiming memory, the user
force-stopping the app), the next process start runs recovery before anything else:

1. The checkpoint is loaded from disk.
2. A call that was still live is ended: `unanswered` if its ring deadline had passed, otherwise
   `failed`. Stored state cannot restore a media session, so continuing it would be a lie.
3. Pending commands are settled, and the platform call is cleaned up.
4. The recovered call is returned from the bootstrap, so your host can tell your backend.
5. Only then is the runtime installed and, on iOS, PushKit started.

Already-ended calls keep their reason and are returned again, so cleanup retries after a second
crash. Recovery is cleanup, not seamless continuation.

## Pending operations

An operation still pending from the previous process might have run or not; its callback is
gone. Off the startup path, the reconciler asks your host's probe for evidence
(`Applied`, `Rejected` or `Unavailable`) from the platform or your backend. Operations whose
deadline passed become `timedOut` without a probe.

## Storage failures

Callx never replaces a corrupt or unreadable checkpoint with empty state. A storage error fails
the bootstrap; your host reports calling as unavailable instead of running with a state that
might ring an ended call again.

## Account switches

Each `accountGeneration` has its own checkpoint, journal, results and cursors. On sign-out:

1. Stop observers and close sessions.
2. Unregister the push token on your backend.
3. Rotate the generation and bootstrap a new runtime.
4. Re-subscribe observers.

Operations and cursors from the previous generation return `generationMismatch` instead of
leaking into the new account.

## Credentials while locked

If your native host needs credentials to reach your backend while the phone is locked (for
example from a listener when a call is answered on the lock screen), store only those items
with `kSecAttrAccessibleAfterFirstUnlock` on iOS. Items marked `WhenUnlocked` cannot be read
then. The LiveKit adapter already stores its configuration this way, and with the Android
Keystore.
