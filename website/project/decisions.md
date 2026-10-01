---
title: "Decisions"
description: "The architecture decisions behind Callx, in short, with links to the full records."
---

# Decisions

Callx records significant design decisions as Architecture Decision Records (ADRs). Each one
states the context, the decision and its consequences. This page summarizes them.

| ADR | Decision | In one sentence |
|---|---|---|
| 0001 | Android minimum SDK 29 | A scope choice that keeps the device test matrix small enough to test properly |
| 0002 | Commands and observation | Commands return explicit results; state is observed from native snapshots, never inferred |
| 0004 | Audio ownership | CallKit activates iOS audio, Telecom routes Android audio, the media SDK only encodes and plays |
| 0005 | Validation gates | Features are released on measured evidence, with simulator and device results kept apart |
| 0006 | One native core for two frameworks | Flutter and React Native ship the same Swift and Kotlin sources, kept identical by a parity check |
| 0007 | Library-owned incoming path | Callx receives pushes, decides whether to ring and reports to the OS, so no framework code is on the critical path |
| 0008 | LiveKit as the first media adapter | It carries only media, so Callx keeps the incoming path and the host keeps signaling |
| 0009 | Package ecosystem | A provider-free core plus independent adapters that install with no host code |

## Principles that run through them

- **One owner per concern**: the OS call, the audio session, the call state.
- **Evidence over intent**: a command is applied when the platform confirms it; a feature is
  verified when a device run proves it.
- **Honest limits**: what the platform forbids is documented, not worked around with hacks that
  break on the next OS release.
- **Small dependency surface**: the core depends only on the platform.

Proposing a significant change? Open a discussion first; if it is accepted, it gets an ADR.
