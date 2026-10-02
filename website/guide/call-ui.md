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
iOS system PiP remains unsupported; physical iOS media/navigation acceptance is still pending.

See the complete integrations in
[Flutter main.dart](https://github.com/bear-block/callx/blob/main/packages/callx/example/lib/main.dart)
and [RN App.tsx](https://github.com/bear-block/callx/blob/main/packages/react-native/example/App.tsx),
and the [verification status](/project/status).
