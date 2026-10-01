---
title: "Sponsor Callx"
description: "Why Callx needs funding, exactly where the money goes, and how individuals and companies can support it."
---

# Sponsor Callx

<p class="lead">
Callx is free, MIT licensed and independent. It has no paid tier, no telemetry and no company
selling a hosted service behind it. Sponsorship is what keeps it that way, and what pays for the
one thing a call library cannot do without: testing on real phones.
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

## Why a call library needs money

Most libraries can be tested in CI. Calls cannot. Whether a phone rings depends on the phone:
Android vendors add their own battery managers and notification rules, iOS behaves differently on
the lock screen, Bluetooth headsets and cars each have quirks, and every OS release changes
something. Emulators and simulators cover the logic; they cannot tell you whether a Xiaomi phone
with autostart off rings.

That is why so many call integrations work in development and fail for a slice of users in
production. The fix is unglamorous and costs money: a shelf of real devices, time to run the same
scenarios on each of them for every release, and the discipline to publish the results.

## Where the money goes

Every sponsorship goes to these, in this order.

| Priority | What | Estimated cost | Why it matters |
|---|---|---|---|
| 1 | **Device lab**: Android phones from Samsung, Xiaomi, Oppo, Vivo, Google and others, plus iPhones on current and previous iOS | about US$3,000 one-time, then about US$800 a year for new OS versions | Each vendor family tested is a class of missed calls fixed, for everyone |
| 2 | **Release verification time**: running the acceptance checklist on every device for every release, and publishing the [evidence](/project/status) | about 3 days per release | Verified claims instead of hopes |
| 3 | **Platform costs**: Apple Developer Program, macOS CI minutes, a test backend | about US$1,000 a year | iOS builds and push tests need them |
| 4 | **Maintenance**: issues, OS updates (iOS and Android betas every summer), security fixes, reviews | Part-time maintainer hours | A call library that falls behind an OS release breaks quietly |
| 5 | **New capabilities**: video adapters, more media adapters, multiple calls | Per milestone | Following the [roadmap](/project/roadmap) |

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
    <p>Name and link in the sponsors list, and a vote on which device family we test next.</p>
  </div>
  <div>
    <h4>Company</h4>
    <div class="price">$250 / month</div>
    <p>Logo on this page and in the README. Your devices prioritized in the test lab.</p>
  </div>
  <div>
    <h4>Partner</h4>
    <div class="price">$1,000 / month</div>
    <p>Large logo on the home page and README, plus a quarterly roadmap call with the maintainers.</p>
  </div>
</div>

Sponsorship never buys features in the library, private forks or a say over what is accepted;
it funds the work that benefits every user. One-time donations of any size are just as welcome.

### Sponsor a device

Prefer hardware? We gladly accept phones, especially recent mid-range models from Xiaomi, Oppo,
Vivo, Realme, Huawei and Samsung. Open an issue with the model and we will arrange shipping, then
list the device, and you, on the [status page](/project/status).

## Grants

Callx is preparing applications to public open-source funds:

| Programme | Fit |
|---|---|
| [NLnet NGI Zero Commons Fund](https://nlnet.nl/commonsfund/) | Open internet commons; privacy-respecting communication infrastructure with no telemetry |
| [FLOSS/fund](https://floss.fund/) | Annual grants for free and open-source projects, reviewed from public [`funding.json`](/callx/funding.json) manifests |

Organisations running grant programmes are welcome to contact the maintainers.

## Sponsors

bear-block's sponsors support Callx and [vision-camera-ocr](https://github.com/bear-block/vision-camera-ocr).
The list updates every day from GitHub Sponsors and Buy Me a Coffee.

<SponsorList />

## Other ways to help

- **Test on your devices** and [report results](https://github.com/bear-block/callx/issues/new).
  It is the next most valuable thing after funding.
- **Star the repository** and tell teams who build calls.
- **Contribute** docs, fixes and adapters: see [contributing](/project/contributing).
