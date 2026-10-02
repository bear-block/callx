---
title: "iOS"
description: "CallKit, PushKit, the reporting rule, audio sessions, the lock screen and other iOS specifics."
---

# iOS

On iOS, Callx uses CallKit for the system call UI and PushKit for VoIP pushes. Requirements:
iOS 15 or later, built with Xcode 26 or later (Swift 6).

## Setup checklist

- [ ] **Push Notifications** capability.
- [ ] **Background Modes**: *Audio, AirPlay, and Picture in Picture* and *Voice over IP*.
- [ ] `NSMicrophoneUsageDescription` in `Info.plist`.
- [ ] An APNs auth key (`.p8`) on your server, and the `aps-environment` entitlement matching
      the build (`development` or `production`).
- [ ] The bootstrap in `application(_:didFinishLaunchingWithOptions:)`.

The Expo plugin sets all of these except the APNs key.

## The reporting rule

iOS 13 and later require an app to report every VoIP push to CallKit before the push handler
returns. An app that fails is terminated, and repeated failures can stop VoIP push delivery to
it. This is the single most common cause of iOS crashes in call apps, because the report waits
for JavaScript or Dart.

Callx reports natively, from the PushKit delegate, without waiting for the framework or the
network:

- Invitations that may ring are reported as incoming calls.
- Invitations that must not ring (duplicate, busy, expired, already ended, undecodable) are
  reported under a fresh UUID and ended at once, so they never touch the real call.
- On iOS 26.4 and later, PushKit tells the app whether a push must be reported. Callx skips the
  throwaway report when it is not required.

Send only call invitations as VoIP pushes. Use your signaling connection for cancellations and
other events.

## Audio session

CallKit activates the audio session after an answer completes, also on the lock screen, and
tells the app through `provider(_:didActivate:)`. Callx forwards this to the media adapter:

- The media engine must not configure or activate `AVAudioSession` by itself.
- Audio starts in `didActivate` and stops in `didDeactivate`.
- Do not wait for activation before fulfilling the answer: iOS activates only after the answer is
  fulfilled.

The LiveKit adapter turns off LiveKit's automatic session configuration and enables its engine
only inside this window.

## Lock screen

When a call is answered on the lock screen, CallKit connects the call and keeps its own UI. The
app opens only after the user unlocks; until then, media runs and the call is fully usable. This
is iOS behaviour, not a setting.

## Before the first unlock

After a reboot, the device's data protection keeps app files locked until the user unlocks once.
Callx's checkpoint is readable only after the first unlock, so calls that arrive before it are
missed. Store any credentials your host needs on a locked phone with
`kSecAttrAccessibleAfterFirstUnlock`.

## Provider configuration

Pass your own `CXProviderConfiguration` through `config.providerConfiguration` to set:

- `iconTemplateImageData`: the monochrome icon on the call screen.
- `ringtoneSound`: a sound file in your bundle.
- `includesCallsInRecents`: whether calls appear in the Phone app's Recents.
- `supportsVideo`, `maximumCallGroups`, `supportedHandleTypes`.

Callx uses one call and generic handles by default. In version 0.2.2, bootstrap
enables `supportsVideo` when the installed adapter supports video. Version 0.1.3 packages were voice-only. iOS video still needs an iPhone trial; iOS PiP is not implemented.

## The Simulator

The iOS Simulator cannot receive VoIP pushes and ends CallKit calls immediately. Use it for UI
work with the [simulator backend](/guide/simulator); test calls on an iPhone.

## Mainland China

Apple's App Store rules require apps available in mainland China to disable CallKit. Callx does
not support those markets in this version.
