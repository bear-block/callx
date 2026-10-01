---
title: "Provider-managed signaling"
description: "Use Callx with providers that own invitations and push themselves, such as Twilio Programmable Voice, while keeping one owner of the OS call."
---

# Provider-managed signaling

Some providers carry more than media. Twilio Programmable Voice, Vonage Voice, Telnyx, Plivo,
Sinch and SIP stacks own the invitation, the push and call control on their servers. With them,
Callx's push ingress steps aside and the provider's events drive the core.

## How it differs

| | Bring-your-own signaling (default) | Provider-managed |
|---|---|---|
| Who sends invitations | Your backend, Callx payload | The provider |
| Who receives the push | Callx ingress | The provider SDK, forwarded by an adapter |
| Who reports calls to the OS | Callx | Callx, through the adapter |
| `providerManagedSignaling` capability | `false` | `true` |

The rule does not change: **Callx is the only component that reports calls to CallKit or
Core-Telecom.** The provider SDK's own CallKit or ConnectionService integration stays off.

## How a signaling adapter drives the core

A signaling adapter translates provider events into runtime calls:

| Provider event | Runtime call |
|---|---|
| Incoming call invite | `runtime.reportIncoming(…)` |
| Call cancelled or ended remotely | `runtime.remoteEnded(callId, reason)` |
| The platform answered or ended the call | `runtime.platformAnswered(callId)` / `runtime.platformEnded(callId)` |
| Media connected / reconnecting | `runtime.mediaConnected(callId)` / `runtime.mediaInterrupted(callId)` |

Do not create `CallKitIngress` or `TelecomIngress` in this mode: there must be a single owner of
platform reports.

## Status

The signaling adapter interface is being designed with its first implementation, Twilio
Programmable Voice. Until it ships, hosts can wire the runtime calls above themselves. Follow the
[roadmap](/project/roadmap) and the [decisions](/project/decisions) page for progress.
