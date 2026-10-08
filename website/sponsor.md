---
title: "Sponsor Callx"
description: "Why Callx needs funding, exactly where the money goes, and how individuals and companies can support it."
---

# Sponsor Callx

<p class="lead">
Callx is free, MIT licensed and independent. It has no paid tier, no telemetry and no company
selling a hosted service behind it. Sponsorship pays for the maintainer time that keeps it that
way: following every iOS and Android release, reviewing and shipping fixes, and building what
is next on the roadmap.
</p>

<div class="sponsor-tiers">
  <div>
    <h4>GitHub Sponsors</h4>
    <p>Monthly membership or one-time, from your GitHub account. Companies can sponsor from their GitHub organization.</p>
    <p><a href="https://github.com/sponsors/bear-block">Sponsor on GitHub →</a></p>
  </div>
  <div>
    <h4>Buy Me a Coffee</h4>
    <p>A one-time thank-you of any size, no account needed.</p>
    <p><a href="https://buymeacoffee.com/bearblock">Buy a coffee →</a></p>
  </div>
</div>

## Why a call library needs ongoing work

A call library is never finished. Every year iOS and Android change the rules for calls:
full-screen intents became a restricted permission on Android 14, foreground services must
declare a type since Android 14 and face more limits in 15, iOS terminates apps that receive a
VoIP push without reporting a call, and each beta summer brings something new. Provider SDKs move too, and each adapter pins an exact version that has to be
upgraded and checked.

A library that falls behind does not fail loudly. Calls stop ringing for a slice of users, on one
OS version or one vendor, and nobody sees an error. Keeping Callx correct means reading the
platform changes, updating the core and adapters, running the conformance checks on every
release, and publishing what was verified.

## Where the money goes

| Priority | What | Why it matters |
|---|---|---|
| 1 | **Maintenance**: iOS and Android releases and betas, provider SDK upgrades, issues, security fixes, reviews | A call library that falls behind an OS release breaks quietly |
| 2 | **Release verification**: running the [emulator matrix](/project/status#android-emulator-matrix) and the acceptance checklist for every release, reviewing device results from the community, and publishing the [evidence](/project/status) | Verified claims instead of hopes |
| 3 | **New capabilities**: video, more media adapters, multiple calls | Following the [roadmap](/project/roadmap) |
| 4 | **Platform costs**: the Apple Developer Program, which push and CallKit testing need, and macOS CI minutes | iOS builds and VoIP push tests cannot run without them |

## Sponsor tiers

<div class="sponsor-tiers">
  <div>
    <h4>Backer</h4>
    <div class="price">$5 / month</div>
    <p>Your name in the sponsors list. Thank you.</p>
  </div>
  <div>
    <h4>Supporter</h4>
    <div class="price">$25 / month</div>
    <p>Name and link in the sponsors list, and a vote on roadmap priorities.</p>
  </div>
  <div>
    <h4>Company</h4>
    <div class="price">$250 / month</div>
    <p>Logo on this page and in the README. Issues you report are triaged first.</p>
  </div>
  <div>
    <h4>Partner</h4>
    <div class="price">$1,000 / month</div>
    <p>Large logo on the home page and README, plus a quarterly roadmap call with the maintainers.</p>
  </div>
</div>

Sponsorship never buys features in the library, private forks or a say over what is accepted;
it funds the work that benefits every user. For help with your own app, see
[work with us](/services). One-time donations of any size are just as welcome.

## Help verify on real devices

Emulators and simulators cover the logic. Whether a phone rings on the lock screen, with a
vendor's battery manager or a Bluetooth headset, is only proven on real hardware, and the most
useful hardware is the phones your users already have. Two ways to help, neither costs money:

- **Share test results.** Run the [acceptance checklist](/guides/testing#acceptance-checklist)
  on your phone and [open a device results issue](https://github.com/bear-block/callx/issues/new?template=device-results.yml)
  with the device, OS version, Callx version and what passed or failed. Results are listed on the
  [status page](/project/status) with credit.
- **Pass on a phone you no longer use.** Older phones are welcome, especially Android 10–12 and
  vendor ROMs (Xiaomi, Samsung, Oppo, Vivo, Huawei) and iPhones that still run iOS 15 or later.
  Open an issue with the model and we will arrange it; the device and you are listed on the
  status page.

## Grants

Callx is preparing applications to public open-source funds:

| Programme | Fit |
|---|---|
| [NLnet NGI Zero Commons Fund](https://nlnet.nl/commonsfund/) | Open internet commons; privacy-respecting communication infrastructure with no telemetry |
| [FLOSS/fund](https://floss.fund/) | Annual grants for free and open-source projects, reviewed from public [`funding.json`](/funding.json) manifests |

Organisations running grant programmes are welcome to contact the maintainers.

## Sponsors

bear-block's sponsors support Callx and [vision-camera-ocr](https://github.com/bear-block/vision-camera-ocr).
The list updates every day from GitHub Sponsors and Buy Me a Coffee.

<SponsorList />

## Other ways to help

- **Star the repository** and tell teams who build calls.
- **Contribute** docs, fixes and adapters: see [contributing](/project/contributing).
