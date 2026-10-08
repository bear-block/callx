---
title: "Personalize your setup"
description: "Choose your framework, platforms, UI, media and backend to get a supported Callx integration path."
---

# Personalize your setup

::: tip New to Callx?
Read the five-step [quick start](/guide/) first. This page generates a checklist and starter
files for a specific combination of framework, UI, media and backend.
:::

Choose how your application will use Callx. This guide produces an ordered checklist with
installation commands, copyable starter files, the relevant configuration pages and a result to verify at each step.
Your choices stay in this page; nothing is submitted to a server.

<SetupGuide />

## Before you start

- Read the [requirements](/guide/#requirements) first.
- New to calling? Your backend signals *who is calling whom*. Your media provider carries
  microphone/camera tracks. Callx coordinates the native phone lifecycle and your app UI.
- A local console is a development tool, not a hosted backend. Real FCM/APNs trials still
  require credentials. Browser preview tests presentation without proving native calls.
- Custom app screens retain CallKit/Telecom integration. There is no shipped Dart/TypeScript
  switch that disables all native incoming presentation.

Watch [Steven call hao.dev7](/guide/demos) for the cross-framework emulator demo,
or [incoming calls on the lock screen](/guide/lockscreen-demo) for native voice/video acceptance.
