---
title: "Native host integration"
description: "Bootstrap options, listeners, the Android notification and lock-screen policy, CallKit actions and building the pipeline yourself."
---

# Native host integration

The quick starts call `bootstrap` with defaults. This guide covers every option, the native
callbacks your host can use, and how to assemble the pipeline yourself when the defaults are not
enough.

## Bootstrap options

::: code-group

```kotlin [Android]
val started = CallxPlugin.bootstrap(this, CallxBootstrapConfig(   // RN: CallxModule.bootstrap
    accountGeneration = AccountStore.generation(this),
    listener = CallListener(backend),          // backend work per call event
    systemActions = WatchAndCarActions(),      // answer/hold/hangup from other surfaces
    presenter = { context -> CallStylePresenter(context, lockedAnswer = LockedAnswer.RequireUnlock) },
    reconciliationProbe = BackendProbe(backend),
    log = { Log.d("Callx", it) },
))
// started.runtime, started.ingress, started.media, started.recoveredCall
```

```swift [iOS]
var config = CallxBootstrapConfig()
config.accountGeneration = AccountStore.generation()
config.listener = CallListener(backend)        // backend work per call event
config.performer = BackendPerformer(backend)   // backend work per CallKit action
config.providerConfiguration = makeProviderConfiguration()
config.reconciliationProbe = BackendProbe(backend)
config.log = { NSLog("Callx: %@", $0) }
let started = try CallxPlugin.bootstrap(config) // RN: CallxReactNativeHost.bootstrap
// started.ready completes after recovery; Dart/JS setup waits for it.
```

:::

| Option | Default | Purpose |
|---|---|---|
| `accountGeneration` | `"default"` | Isolates each login's checkpoint; rotate on sign-out |
| `checkpointPath` / `checkpointURL` | App-private `callx/<generation>/coordinator.json` | Where state is saved |
| `listener` | None | Your callbacks for push, ring, answer and end events |
| `systemActions` (Android) / `performer` (iOS) | Accept every action | Backend work when the user acts from the system UI, a watch or a car |
| `presenter` (Android) | `CallStylePresenter` | The incoming and ongoing call notification |
| `providerConfiguration` (iOS) | Voice only, one call, generic handles | Your `CXProviderConfiguration`: icon, ringtone, Recents |
| `media` | Discovered adapter | An explicit adapter instance |
| `discoverMedia` | `true` | Look for an installed adapter package |
| `muteController` (Android) / `audio` (iOS) | None | For hosts that run media from listener callbacks |
| `reconciliationProbe` | Reports unavailable | Evidence for operations pending from a previous process |
| `startPushRegistry` (iOS) | `true` | Turn off if calls arrive only over signaling |
| `log` | None | Diagnostic log lines (no tokens or payloads) |

### Bootstrap failures

`bootstrap` throws when calling cannot work. Catch it and show calling as unavailable:

| Error | Cause |
|---|---|
| `UnsupportedOperationException` (Android) | The device does not implement Telecom (some tablets and Android Go builds) |
| `IllegalStateException` | Two media adapters are installed |
| Storage errors | The checkpoint cannot be read or written; it is never silently replaced |

## Listener callbacks

::: code-group

```kotlin [Android]
class CallListener(private val backend: Backend) : TelecomIngressListener {
    override fun onPushReceived(callId: String?, priority: Int?, originalPriority: Int?) {}
    override fun onInvitationAccepted(invitation: Invitation) { backend.connectSignaling(invitation.callId) }
    override fun onInvitationRejected(invitation: Invitation?, outcome: IncomingOutcome?) {
        if (outcome == IncomingOutcome.Busy) invitation?.let { backend.reportBusy(it.callId) }
    }
    override fun onCallAnswered(callId: String) { backend.accept(callId) }   // any surface
    override fun onCallEnded(callId: String) { backend.end(callId) }         // any reason
    override fun onRingTimedOut(callId: String) {}
}
```

```swift [iOS]
final class CallListener: CallKitIngressListener {
    func pushTokenUpdated(_ token: Data) {}           // Callx also records it for getPushToken()
    func pushTokenInvalidated() {}
    func invitationAccepted(_ invitation: Invitation) { backend.connectSignaling(invitation.callID) }
    func invitationRejected(_ invitation: Invitation?, outcome: IncomingOutcome?) {}
    func ringTimedOut(callID: String) {}
    func callAnswered(callID: String) { backend.accept(callID) }   // any surface
    func callEnded(callID: String) { backend.end(callID) }         // any reason
}
```

:::

`onCallAnswered`/`callAnswered` and `onCallEnded`/`callEnded` fire **once per call**, whichever
surface acted: the system UI, a notification button, your app, a watch, a car, or the remote
side of an outgoing call. `callEnded` also fires for calls that never rang. Callbacks run under
the ingress lock: return immediately and do network work asynchronously.

## Reporting signaling events

| Your backend says | Android | iOS |
|---|---|---|
| Invitation (app running) | `ingress.handleInvitation(invitation)` | `await ingress.handleInvitation(invitation)` |
| Remote answered your call | `ingress.remoteAnswered(callId)` | `try await ingress.remoteAnswered(callID:)` |
| Remote ended or cancelled | `ingress.remoteEnded(callId, reason)` | `try await ingress.remoteEnded(callID:reason:)` |
| Media flows / returns | `runtime.mediaConnected(callId)` | `try await runtime.mediaConnected(callID:)` |
| Media dropped | `runtime.mediaInterrupted(callId)` | `try await runtime.mediaInterrupted(callID:)` |

The Android ingress methods are `suspend` functions; `mediaConnected` and `mediaInterrupted` are
not.

## Android: notification and lock screen

### Lock-screen answer policy

```kotlin
CallStylePresenter(context, lockedAnswer = LockedAnswer.ShowOverLockScreen)
```

| `LockedAnswer` | Behaviour |
|---|---|
| `RequireUnlock` (default, like iOS) | The call connects at once; Android asks the user to unlock. Until then a native call screen with the caller, a timer, "Open app" and hang-up stays on the lock screen |
| `ShowOverLockScreen` | Your app opens above the lock screen without unlocking, and goes back behind it when the call ends. Everything that screen shows is reachable without unlocking, so use it only when it shows nothing but the call. Call `CallxLockScreen.onIntent(this, intent)` from `onCreate` and `onNewIntent` of your launcher Activity |

Answering opens your launcher Activity with the call ID in `TelecomIngress.EXTRA_CALL_ID`.

### Customizing the notification

- **Incoming screen**: pass `fullScreenIntent = { callId -> pendingIntentFor(callId) }` to
  `CallStylePresenter`, or keep Callx's native `CallxIncomingCallActivity`.
- **Tap action**: `contentIntent = { callId -> … }` opens your screen when the notification is tapped.
- **Icon**: `smallIcon` (defaults to the app icon).
- **Labels**: `labels = CallNotificationLabels(answer = …, decline = …, hangUp = …, openApp = …,
  incomingChannel = …, ongoingChannel = …)` for localization.
- **Silence**: `ingress.silenceIncoming(callId)` stops the ringtone; Callx's incoming screen
  calls it on volume-down.
- **Full control**: implement `IncomingCallPresenter`.

### Full-screen intent permission

Android 14+ lets users and Play policy deny full-screen intents. Calls then appear as heads-up
notifications. Check and send users to the setting:

```kotlin
if (!CallxFullScreenIntent.isAllowed(context)) {
    startActivity(CallxFullScreenIntent.settingsIntent(context))
}
```

### Actions from watches and cars

Telecom tears a call down if an action callback takes more than five seconds. Callx gives your
`TelecomSystemActionHandler` four seconds for answer, hold and resume and records the action only
after it returns; throw to refuse. Hang-ups always succeed: Callx records them first and calls
your `disconnect` without waiting.

### Audio routing

```kotlin
// In your TelecomIngressListener:
override fun onAudioEndpointsChanged(callId: String, current: CallEndpointCompat,
                                     available: List<CallEndpointCompat>) { showRoutes(current, available) }

// When the user picks a route (a suspend function; returns false if Telecom refused):
ingress.requestAudioEndpoint(callId, speaker)
```

Route only through Telecom. See [media and audio ownership](/concepts/media).

## iOS: CallKit actions and audio

- Your `CallKitActionPerforming` performer does backend work for each CallKit action. Callx
  fulfills the action only after it succeeds; an accepted transaction alone is not enough.
- Callx tracks actions that start in the system UI (no operation ID) as well as those your app
  submits, and ignores performer callbacks that arrive after a timeout or reset.
- `didActivate` and `didDeactivate` run on the provider's delegate queue. Do not wait for
  activation before fulfilling an answer: iOS activates audio only after the answer completes.
- `CXProvider` holds its delegate weakly; the bootstrap retains everything for the app's
  lifetime.

## Building the pipeline yourself

`CallxBootstrap` is a convenience over public parts. A host that needs, for example, two
checkpoints or a custom executor can assemble them directly:

::: details Android
```kotlin
CallxTelecomAvailability.requireSupported(context)
val callsManager = CallsManager(context).apply {
    registerAppWithTelecom(CallsManager.CAPABILITY_BASELINE)
}
val ingress = TelecomIngress(
    scope = appScope,
    presenter = CallStylePresenter(context),
    listener = listener,
    media = muteController,
)
val sessions = CoreTelecomSessionManager(
    callsManager, ingress.systemActions(systemActions), appScope, ingress.audioObserver,
)
val executor = ingress.executor(TelecomPlatformExecutor(
    coroutineScope = appScope, calls = sessions, media = muteController, outgoing = sessions,
))
val coordinator = CallCoordinator(CoordinatorFileStore(checkpointPath))
val runtime = BridgeRuntime(coordinator, executor, BridgeCapabilities(
    accountGeneration = generation, durableReplay = true,
    providerManagedSignaling = false, hold = true, mute = true,
))
ingress.attach(runtime, sessions)
val recovered = runBlocking { ingress.recoverAfterProcessDeath() }
CallxPlugin.configure(runtime)          // RN: CallxModule.configure(runtime)
appScope.launch(Dispatchers.IO) {
    RecoveredOperationReconciler(coordinator, probe).reconcile(System.currentTimeMillis())
}
```
:::

::: details iOS
```swift
let nowMs: @Sendable () -> Int64 = { Int64(Date().timeIntervalSince1970 * 1000) }
let uuids = CallUUIDMap()
let actionIndex = CallKitActionIndex()
let registry = PlatformActionRegistry()
let lifecycle = CallKitActionLifecycle(index: actionIndex, registry: registry, nowMs: nowMs)
let executor = RegistryBackedPlatformExecutor(
    submitter: CallKitTransactionSubmitter(resolver: uuids, index: actionIndex, nowMs: nowMs),
    registry: registry)
let delegate = CallKitProviderDelegateAdapter(performer: performer, lifecycle: lifecycle, audio: audio)
provider.setDelegate(delegate, queue: providerQueue)

let coordinator = try CallCoordinator(store: CoordinatorFileStore(url: checkpointURL))
let runtime = BridgeRuntime(coordinator: coordinator, executor: executor,
    capabilities: .init(accountGeneration: generation, durableReplay: true,
                        providerManagedSignaling: false, hold: true, mute: true),
    nowMs: nowMs)
let ingress = CallKitIngress(runtime: runtime, reporter: provider, uuids: uuids,
    lifecycle: lifecycle, listener: listener, nowMs: nowMs)
Task {
    _ = try await ingress.recoverAfterProcessDeath()
    CallxPlugin.configure(runtime)      // RN: CallxReactNativeHost.configure(runtime)
    ingress.startPushRegistry()
}
```
:::

Order matters: recover before installing the runtime, and install the runtime before starting
PushKit. Retain the provider, delegate and ingress for the app's lifetime.
