---
title: "Personalize your setup"
description: "Choose your framework, platforms, UI, media and backend to get a supported Callx integration path."
---

# Personalize your setup

Choose how your application will use Callx. This guide produces an ordered checklist with
installation commands, the relevant configuration pages and a result to verify at each step.
Your choices stay in this page; nothing is submitted to a server.

<SetupGuide />

## Before you start

- Callx packages are at **0.2.2**, contract **0.2.0**. Read [requirements](/guide/#requirements).
- New to calling? Your backend signals *who is calling whom*. Your media provider carries
  microphone/camera tracks. Callx coordinates the native phone lifecycle and your app UI.
- A local console is a development tool, not a hosted backend. Real FCM/APNs trials still
  require credentials. Browser preview tests presentation without proving native calls.
- Standalone Kotlin/Swift SDKs, the hosted backend and adapters other than LiveKit are
  **planned**, not available integrations. Selecting them explains the missing support.
- Custom app screens retain CallKit/Telecom integration. There is no shipped Dart/TypeScript
  switch that disables all native incoming presentation.

Watch [Steven call hao.dev7](/guide/demos) to see the current cross-framework emulator demo.
