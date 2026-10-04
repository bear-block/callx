---
title: "Call overlay and mini-call"
description: "Optional Flutter and React Native UI, with native-owned call state and app-owned navigation."
---

# Call overlay and mini-call

::: info Available since 0.2.2
These optional UI components are included in version 0.2.2.
:::

Mount `CallxCallOverlay` once above your app's navigation. Its Home/navigation child stays
mounted when the call expands. Use `CallxPresentationController` to decide what to show from
native snapshots; it does not answer, end, join media or write call state.

Watch [Steven call hao.dev7 across the two frameworks](/guide/demos) to see the incoming
surface, call overlay, in-app mini-call and Android system PiP in an emulator recording.

## Choosing who renders the UI

Call presentation can be separated from the native call lifecycle. Choose incoming-call
presentation independently from the screen shown after acceptance.

| Choice | Current support | Customization |
|---|---|---|
| Native presentation | Android provides a default incoming notification/lock-screen presenter and a native `CallxBootstrapConfig.presenter` factory. iOS uses CallKit. A complete native video-call screen with Dart/TypeScript configuration is not implemented. | Android hosts can replace the presenter in Kotlin. System UI appearance is controlled by the OS. |
| Your Flutter or React Native UI | Supported through snapshots, commands and video views; importing the optional UI package is unnecessary. | Build your own Dart or TypeScript/TSX screens and navigation. |
| Callx Flutter or React Native UI | The optional components below are available in version 0.2.2. | Supply branding, controls, video rendering and expanded/minimized widgets. |

These are integration choices, not a shipped three-value configuration API. There is
currently no Dart/TypeScript switch that disables all native presentation. Using a custom
app screen still retains native call ownership and system integration. Background and
terminated-app incoming calls need a native presentation path; Android's ongoing call
notification also remains part of the native integration.

The examples currently use native incoming presentation followed by the optional framework
call overlay after acceptance. If you build a foreground incoming screen, coordinate it with
the native presenter so the same invitation does not display two incoming screens.

## Incoming and accepted calls

An `incoming` snapshot keeps the overlay hidden. In Device mode, let CallKit/Telecom and the
notification present the invitation. Do not also navigate to an incoming app screen.
A confirmed `connecting`, `active` or `held` call opens the overlay; an outgoing call opens
immediately. Answering from a notification follows the same observed state path as answering
from app controls. An incoming call that is declined, cancelled or expires never opens the
call overlay. A recovered live call can reopen the overlay without sending another answer.

The examples expose Answer/Decline in Simulator mode, which has no system notification.
Their Diagnostics screen also provides explicit test controls for native incoming calls.

## Public optional entry points

::: code-group

```tsx [React Native]
import {CallxCallOverlay, CallxCallScreen, CallxMiniCall,
  CallxPresentationController} from '@bear-block/callx/ui';
import type {CallxCallBrand} from '@bear-block/callx/ui';
// The controller alone has no React Native UI import:
import {CallxPresentationController as Presentation} from '@bear-block/callx/presentation';
```

```dart [Flutter]
import 'package:callx/callx_ui.dart';
// CallxCallOverlay, CallxCallScreen, CallxMiniCall,
// CallxCallBrand, CallxCallBackdrop, CallxPresentationController, CallPresentation.
```

:::

Feed each snapshot's call to `controller.update(call)`. Then render the expanded call screen
for `expanded`, a mini-call for `minimized`, and neither for `hidden`. After `minimize()` or
`expand()`, rebuild the UI. Flutter's controller is a `ChangeNotifier`; React apps can mirror
its `mode` into component state. Dispose the Flutter controller with its owner.

`CallxCallScreen` takes the observed call, app controls, elapsed-time widget, local-preview
controls and branding. React Native also takes `renderVideo(source, mirror)`, so the app
chooses its video component and the UI entry does not import native codegen into web previews.
The examples demonstrate using `CallxVideoView` for native video. Importing the ordinary core
entry does not import these optional UI components.

```tsx
<CallxCallOverlay
  expanded={expandedCall}
  minimized={miniCall}
  onMinimize={minimize}
  systemPictureInPicture={inSystemPiP ? compactVideoOrBrand : undefined}>
  <AppNavigation />
</CallxCallOverlay>
```

```dart
CallxCallOverlay(
  expanded: expandedCall,
  minimized: miniCall,
  systemPictureInPicture: inSystemPiP ? compactVideoOrBrand : null,
  onMinimize: minimize,
  child: AppNavigation(),
)
```

Place the overlay in a parent with bounded screen dimensions. Flutter's `PopScope` handles
Back when the overlay is inside a route, as in the example. If your router mounts it outside
all routes, wire the router's back action to `minimize()` while expanded; the components do
not install a navigator or take over your routing. Pass your own colors and logo
through `CallxCallBrand`; the generic default uses a phone symbol. Commands remain explicit
app callbacks: `onEnd` calls the existing end command, while `onMinimize` never ends the call.
Controls are composable, so apps can supply their own labels, appearance and supported actions.

## Mini-call versus system PiP

Back from the expanded overlay minimizes inside the app and preserves navigation. The mini-call
shows remote video, local video or branding, can expand again, and exposes an End call action.
Call-state/media updates preserve the minimized state. Ending the call removes both UI layers.
The initial mini-call is anchored at the bottom right; apps can supply another minimized widget.

Leaving the app can enter Android system PiP using the [video APIs](/guide/video#picture-in-picture-on-android).
It shrinks the host Activity, so it is separate from the mini-call inside that Activity.
Render only compact video/branding while in system PiP. The overlay keeps Home mounted underneath.
Automatic entry still requires native live video-call evidence and Android 12+.
Do not automatically enter system PiP when navigating between pages of the same Activity.

The in-app mini-call is available to Flutter and React Native UI on either mobile platform.
iOS system PiP ships in 0.2.4 as an [experimental feature](/guide/video#picture-in-picture-on-ios);
physical iOS media/navigation acceptance remains pending.

See the complete integrations in
[Flutter main.dart](https://github.com/bear-block/callx/blob/main/packages/callx/example/lib/main.dart)
and [RN App.tsx](https://github.com/bear-block/callx/blob/main/packages/react-native/example/App.tsx),
and the [verification status](/project/status).


## Coordinated call layout (0.2.3)

The following additions are available in **0.2.3**. For changes from 0.2.2, see the
[upgrade guide](/guide/upgrade-0-2-3).
The Flutter and React Native examples use the library's optional call screen and controls.
Home remains mounted beneath the root call overlay; Diagnostics contains trial tools.

Android still uses **self-managed Core-Telecom** for call coordination and audio routing.
Its application-owned incoming and active screens are expected in this model; Android does
not supply a complete video call layout. See [Android Telecom](https://developer.android.com/develop/connectivity/telecom?hl=en).
The native locked-call screen belongs to the library, while the example owns demo signaling
and media credentials. The native presentation and Flutter/React Native presentation are
separate surfaces sharing observed call state.

`CallxCallControl` provides a circular button with a label, selected/disabled state and
accessibility information. Hosts supply callbacks and derive state from snapshots. Hosts
can replace every control; importing UI never accepts calls or joins media.

Customization includes:

- Brand background, accent, foreground, surface and destructive colors, plus an app logo.
- A custom header, status text, localized action labels and a separate end-call slot.
- Preview placement and size, controls and local-camera controls.
- React Native's existing `renderVideo`; Flutter's optional `videoBuilder` for a custom video surface.

Video fills its surface with `cover`. Remote video takes the main surface; a local preview
appears when both sources exist. A front local camera is mirrored. With no video source,
the host's background and logo remain visible. Compact layouts and larger text can scroll
so the end-call action stays reachable.

For Flutter, pass `onPressed: null` to disable a control. For React Native, pass `disabled`.
Camera permission requests, command errors, audio endpoint selection, backend authorization
and token renewal remain host responsibilities. The examples demonstrate these boundaries;
their local console is not a production backend.


React Native hosts using edge-to-edge windows should pass `contentInsets` (top, right,
bottom, left) to `CallxCallScreen` and `CallxCallOverlay`. The example measures them with
`react-native-safe-area-context` inside `SafeAreaProvider`; call controls stay inside those
insets while video extends behind system bars. This API was added in **0.2.3**.
Flutter uses `SafeArea`; the default Android incoming/locked screen applies system-bar and
cutout insets itself. Neither fixed status-bar heights nor decorative demo frames substitute
for device insets.


## Compact video controls (0.2.3)

The **0.2.3** examples use a Material 3 style video action row: microphone, camera,
audio output and end call. Flutter uses Material 3 icon buttons; the RN example
uses Material Icons. Controls use equal 58 dp circular buttons with 28 dp icons, matching the contact-card
actions. End uses the same size and a red color. Hosts can override button size. Hold/resume is directly
available at the top left; camera switching sits on the local preview, or at the top right
when only the local camera is available. The preview anchors to the top safe area, separately
from the name and timer. The camera-switch overlay is a small 20 dp icon with a transparent
background and a 48 dp touch target, so it leaves the preview visible. No system PiP button appears in the call row.

Connected video controls fade out after five idle seconds. Returning to the foreground restores them and starts a fresh timeout. Touching the video restores them;
that first touch does not invoke a hidden action. Voice calls, held/reconnecting calls, errors,
ongoing host actions and screen readers keep controls visible. Reduced-motion settings remove
the fade animation. Compact video actions remain inside safe areas in portrait and landscape;
large text and custom expanded controls can scroll.

Hosts can customize the UI with `compactVideoControls`, `autoHideControls`,
`controlsPinned` and the timeout (`controlsTimeout` in Flutter, `controlsTimeoutMs` in RN).
Pass `compact: true` / `compact` to individual `CallxCallControl` buttons for an icon-only
control. `size` customizes a button diameter, and `leadingControls` supplies direct top-left
actions. Custom controls, headers, branding, video surfaces and end actions remain host slots.
Pin controls while showing a host dialog or running a command. These APIs require 0.2.3 or later.

The 0.2.3 examples enable automatic system PiP by default on supported Android versions.
Back from the call overlay produces the in-app mini-call; Home or leaving the Activity produces
system PiP for a live video call on Android 12+. Navigating inside the app never invokes system
PiP. Hosts can configure that behavior with the existing PiP APIs; manual entry remains an SDK
capability for apps that explicitly choose it. iOS system PiP is
[experimental from 0.2.4](/guide/video#picture-in-picture-on-ios).
