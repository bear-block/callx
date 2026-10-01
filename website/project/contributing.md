---
title: "Contributing"
description: "How to report issues, test on devices, build from source and send changes to Callx."
---

# Contributing

Thank you for helping. Callx is maintained in the open, and contributions of every size matter.

## Ways to help

| Contribution | Impact |
|---|---|
| **Device test reports** | The highest. Run the [acceptance checklist](/guides/testing#acceptance-checklist) on your phones, especially Xiaomi, Oppo, Vivo, Huawei and Samsung, and report the results |
| **Bug reports** | With platform, OS version, device model, versions and log lines |
| **Documentation** | Every page has an "Edit this page" link |
| **Adapters** | A media adapter for your provider; see [write a media adapter](/guides/write-an-adapter) |
| **Code** | Fixes and features, discussed first for anything large |
| **[Sponsorship](/sponsor)** | Funds the device lab and maintenance time |

## Build from source

Requirements: Node.js 24, Flutter (version pinned in `.fvmrc`), Xcode 26 or later, JDK 17,
Android SDK 36, Docker (for the local LiveKit server).

```sh
git clone https://github.com/bear-block/callx && cd callx
npm ci
npm run test:quick     # tools, contract, typecheck, parity, Flutter, React Native
npm run test:all       # plus the Kotlin and Swift suites and the iOS Simulator
```

Run an example app on a device or emulator:

```sh
npm run android:flutter   # or android:rn, ios:flutter, ios:rn
```

## Repository layout

| Path | Contents |
|---|---|
| `native/` | The canonical Swift and Kotlin core. Edit here |
| `adapters/livekit/` | The canonical LiveKit adapter sources |
| `packages/callx`, `packages/react-native` | The framework packages; native sources are vendored copies |
| `packages/callx_livekit`, `packages/react-native-livekit` | The adapter packages |
| `packages/testkit` | The device-trial tools |
| `contracts/v0` | The contract manifest and fixtures |
| `website/` | This site |

Native sources are edited in `native/` and `adapters/`, then copied into packages with
`npm run native:sync`. CI fails if the copies drift (`npm run native:check`).

## Pull requests

1. For anything beyond a small fix, open an issue or discussion first.
2. Keep changes focused; one concern per pull request.
3. Add tests at the lowest level that proves the change: contract fixture, Swift or Kotlin unit
   test, then framework tests.
4. Behaviour on devices needs a dated evidence record before it is marked verified on the
   [status page](/project/status).
5. Write documentation and code comments in English.

## Code of conduct

Be kind, assume good intent, and keep discussions about the work. Harassment of any kind is not
tolerated; report it to the maintainers privately.
