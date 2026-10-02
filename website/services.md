---
title: "Work with us"
description: "Paid help from the Callx maintainers: integrating Callx into your app, building an adapter for your provider, and auditing call integrations that miss calls."
---

# Work with us

<p class="lead">
The maintainers of Callx take on paid work for teams adding native calls to a Flutter or React
Native app. We know where calls go wrong on real phones because that is what Callx exists to fix.
</p>

<div class="sponsor-tiers">
  <div>
    <h4>Callx integration</h4>
    <p>Add incoming and outgoing calls to your existing app: native bootstrap, VoIP and FCM push, CallKit and Core-Telecom, your call UI, and the invitation payloads your backend sends.</p>
  </div>
  <div>
    <h4>Adapter for your provider</h4>
    <p>A media adapter for the provider you already use, such as Agora, Twilio Video or Zoom Video SDK, built to pass the conformance checks and published as open source.</p>
  </div>
  <div>
    <h4>Audit and debugging</h4>
    <p>Calls that do not ring, ring after they were cancelled, lose audio on the lock screen or fail on one vendor's phones. We review your integration, find the cause and fix it, with or without Callx.</p>
  </div>
</div>

## How it works

1. **Email us** at [hao.dev7@gmail.com](mailto:hao.dev7@gmail.com?subject=Callx%20project) with
   a short description: Flutter or React Native, the platforms you ship, your backend and media
   provider, what you need, and your timeline.
2. **We reply** with questions or a proposal: scope, milestones and a fixed price or a time
   estimate.
3. **We build and verify.** Work is checked on the [emulator matrix](/project/status#android-emulator-matrix)
   and on the devices you care about, with the [acceptance checklist](/guides/testing#acceptance-checklist)
   as the definition of done.

## Ground rules

- **Library code stays open.** Adapters and fixes to Callx itself are published under the MIT
  license in the public repository, so every user benefits. Your app code and backend stay yours.
- **Paid work does not buy control over Callx.** Changes to the library go through the same review
  and [design decisions](/project/decisions) as any contribution.
- **No telemetry, no lock-in.** Callx adds no service between you and your users, before or after
  the engagement.

Not ready for paid help? The [guides](/guide/) cover integration end to end, and
[issues](https://github.com/bear-block/callx/issues) are open to everyone.
