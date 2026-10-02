import 'dart:async';
import 'dart:math';
import 'package:flutter/foundation.dart';
import 'call_screen.dart';

import 'package:callx/callx.dart';
import 'package:callx/callx_preview.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

void main() => runApp(const CallxDemoApp());

/// The example's own native channel (Android MainActivity, iOS AppDelegate). It stands in for the
/// signaling backend and media engine during device trials; it is not part of the Callx API.
class DeviceHost {
  static const _channel = MethodChannel('callx_example/host');

  Future<HostStatus> status() async => HostStatus(
    await _channel.invokeMapMethod<String, Object?>('status') ?? const {},
  );
  Future<void> requestPermissions() async =>
      _channel.invokeMethod<void>('requestPermissions');
  Future<void> requestCameraPermission() async =>
      _channel.invokeMethod<void>('requestCameraPermission');
  Future<String?> incoming(
    String callId,
    String displayName, {
    bool video = false,
  }) => _channel.invokeMethod<String>('incoming', {
    'callId': callId,
    'displayName': displayName,
    'video': video,
  });
  Future<void> remoteAnswered(String callId) async =>
      _channel.invokeMethod<void>('remoteAnswered', {'callId': callId});
  Future<void> remoteEnded(String callId, String reason) async => _channel
      .invokeMethod<void>('remoteEnded', {'callId': callId, 'reason': reason});
  Future<void> mediaConnected(String callId) async =>
      _channel.invokeMethod<void>('mediaConnected', {'callId': callId});
  Future<bool> selectAudioEndpoint(int index) async =>
      await _channel.invokeMethod<bool>('selectAudioEndpoint', {
        'index': index,
      }) ??
      false;
}

class HostStatus {
  HostStatus(Map<String, Object?> map)
    : platform = map['platform'] as String? ?? '?',
      simulator = map['simulator'] == true,
      pushReady = map['pushReady'] == true,
      pushToken = map['pushToken'] as String?,
      events = ((map['events'] as List?) ?? const []).cast<String>(),
      endpoints = ((map['endpoints'] as List?) ?? const [])
          .map((e) => (e as Map).cast<String, Object?>())
          .map(
            (e) => (
              name: e['name'] as String? ?? '?',
              current: e['current'] == true,
            ),
          )
          .toList();
  final String platform;

  /// The iOS Simulator ends CallKit calls as soon as they start.
  final bool simulator;
  final bool pushReady;
  final String? pushToken;
  final List<String> events;
  final List<({String name, bool current})> endpoints;
}

enum Mode { simulator, device }

/// Device trials use UUID call IDs, which CallKit maps to its call UUID directly.
String newCallId() {
  final random = Random.secure();
  final bytes = List<int>.generate(16, (_) => random.nextInt(256));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  final hex = bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
  return '${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}-'
      '${hex.substring(16, 20)}-${hex.substring(20)}';
}

class CallxDemoApp extends StatelessWidget {
  const CallxDemoApp({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp(
    debugShowCheckedModeBanner: false,
    title: 'Callx',
    theme: ThemeData(
      useMaterial3: true,
      scaffoldBackgroundColor: const Color(0xfff5f4ef),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          disabledBackgroundColor: const Color(0xff30433f),
          disabledForegroundColor: const Color(0xff9eb3ab),
        ),
      ),
      colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xff145c46)),
    ),
    home: const PreviewScreen(),
  );
}

class PreviewScreen extends StatefulWidget {
  const PreviewScreen({super.key});
  @override
  State<PreviewScreen> createState() => _PreviewScreenState();
}

class _PreviewScreenState extends State<PreviewScreen> {
  final preview = CallxPreview();
  final device = Callx();
  final host = DeviceHost();
  Mode mode = Mode.simulator;
  bool deviceAvailable = false;
  HostStatus? hostStatus;
  Timer? statusTimer;
  StreamSubscription<CallSnapshot>? subscription;
  CallSnapshot snapshot = const CallSnapshot(sequence: '0');
  final List<String> journal = [];
  String? error;
  bool ready = false;
  bool busy = false;
  int counter = 0;
  bool showCall = false;
  bool diagnostics = false;
  bool pictureInPicture = false;
  bool autoPictureInPicture = false;
  StreamSubscription<bool>? pipSubscription;

  Callx get callx => mode == Mode.device ? device : preview.callx;

  @override
  void initState() {
    super.initState();
    observe();
    unawaited(initialize());
    pipSubscription = CallxPictureInPicture.changes.listen((value) {
      if (mounted) setState(() => pictureInPicture = value);
    });
  }

  void observe() {
    unawaited(subscription?.cancel());
    subscription = callx.snapshots.listen((value) {
      if (!mounted) return;
      setState(() {
        if (value.call != null &&
            value.call!.state != CallState.incoming &&
            value.call!.state != CallState.ended &&
            (value.call!.callId != snapshot.call?.callId ||
                snapshot.call?.state == CallState.incoming)) {
          showCall = true;
        }
        snapshot = value;
        journal.insert(
          0,
          '#${value.sequence}  ${value.call?.state.name ?? "idle"}'
          '  · media ${value.call?.mediaInterrupted == true
              ? "interrupted"
              : value.call?.mediaReady == true
              ? "ready"
              : "not ready"}',
        );
        if (journal.length > 8) journal.removeLast();
      });
    });
  }

  Future<void> initialize() async {
    try {
      await preview.callx.setup();
      if (mounted) setState(() => ready = true);
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    }
    // Device mode needs the native host this example configures; tests and web have none.
    try {
      // Native cold-process recovery must finish before installing/using the runtime.
      await host.status();
      final capabilities = await device.setup();
      if (capabilities.nativeCalling && mounted) {
        setState(() => deviceAvailable = true);
        switchMode(Mode.device);
      }
    } on MissingPluginException {
      // Web/widget tests have no device-trial host.
    } on PlatformException catch (e) {
      if (mounted) setState(() => error = e.message);
    } on CallxException catch (e) {
      if (e.code != 'nativeUnavailable' && mounted) {
        setState(() => error = e.toString());
      }
    }
  }

  void switchMode(Mode next) {
    setState(() {
      mode = next;
      snapshot = const CallSnapshot(sequence: '0');
      journal.clear();
      error = null;
    });
    observe();
    unawaited(
      CallxPictureInPicture.configure(
        automatic: next == Mode.device && autoPictureInPicture,
      ),
    );
    statusTimer?.cancel();
    if (next == Mode.device) {
      unawaited(refreshStatus());
      statusTimer = Timer.periodic(
        const Duration(seconds: 2),
        (_) => refreshStatus(),
      );
    }
  }

  Future<void> refreshStatus() async {
    try {
      final status = await host.status();
      if (mounted) setState(() => hostStatus = status);
    } on PlatformException catch (e) {
      if (mounted) setState(() => error = e.message);
    }
  }

  Future<void> run(Future<Object?> Function() action) async {
    if (busy || !ready) return;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final result = await action();
      if (result is CommandResult && mounted) {
        setState(
          () => journal.insert(
            0,
            '${result.operationId}  · ${result.status.name} in ${result.execution.name}',
          ),
        );
        if (journal.length > 8) journal.removeLast();
      }
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  CallInput nextInput({bool video = false}) => CallInput(
    callId: 'demo-${++counter}',
    video: video,
    displayName: 'hao.dev7',
    handle: 'sip:hao.dev7@example.invalid',
  );

  @override
  void dispose() {
    statusTimer?.cancel();
    unawaited(subscription?.cancel());
    unawaited(pipSubscription?.cancel());
    unawaited(CallxPictureInPicture.configure(automatic: false));
    unawaited(preview.callx.dispose());
    super.dispose();
  }

  Widget button(
    String label,
    Future<Object?> Function() action, {
    bool enabled = true,
  }) => OutlinedButton(
    onPressed: ready && !busy && enabled ? () => run(action) : null,
    child: Text(label),
  );

  List<Widget> deviceControls(Call? call, bool live) {
    final status = hostStatus;
    const heading = TextStyle(fontSize: 20, fontWeight: FontWeight.w700);
    const mono = TextStyle(fontFamily: 'monospace', fontSize: 12, height: 1.6);
    return [
      const Text('Call simulation', style: heading),
      const SizedBox(height: 8),
      const Text(
        'Local signaling uses native ingress. Connect the local media server for real audio and video.',
      ),
      if (status?.simulator == true) ...[
        const SizedBox(height: 8),
        const Text(
          'The iOS Simulator ends CallKit calls immediately. Use a device for call trials.',
          style: TextStyle(
            color: Color(0xffa94135),
            fontWeight: FontWeight.w700,
          ),
        ),
      ],
      const SizedBox(height: 16),
      Wrap(
        spacing: 8,
        runSpacing: 8,
        children: [
          button('Permissions', host.requestPermissions),
          if (call?.state == CallState.incoming)
            button('Answer', () => device.answer(call!.callId)),
          button(
            'Incoming (local signaling)',
            () => host.incoming(newCallId(), 'hao.dev7'),
            enabled: !live,
          ),
          button(
            'Start outgoing',
            () => device.startCall(
              CallInput(
                callId: newCallId(),
                displayName: 'hao.dev7',
                handle: 'callx:hao.dev7',
              ),
            ),
            enabled: !live,
          ),
          button(
            'Remote answers',
            () => host.remoteAnswered(call!.callId),
            enabled: call?.state == CallState.outgoing,
          ),
          button(
            'Media connected (simulated)',
            () => host.mediaConnected(call!.callId),
            enabled: call?.state == CallState.connecting,
          ),
          button(
            'Caller cancels',
            () => host.remoteEnded(call!.callId, 'callerCancelled'),
            enabled: call?.state == CallState.incoming,
          ),
          button(
            'Remote ends',
            () => host.remoteEnded(call!.callId, 'remoteEnded'),
            enabled: live,
          ),
        ],
      ),
      if (status != null && status.endpoints.isNotEmpty) ...[
        const SizedBox(height: 12),
        Wrap(
          spacing: 8,
          children: [
            for (final (index, endpoint) in status.endpoints.indexed)
              ChoiceChip(
                label: Text(endpoint.name),
                selected: endpoint.current,
                onSelected: (_) => run(() => host.selectAudioEndpoint(index)),
              ),
          ],
        ),
      ],
      const SizedBox(height: 20),
      Text('Push · ${status?.platform ?? '…'}', style: heading),
      const SizedBox(height: 8),
      if (status == null)
        const Text('Reading host status…')
      else if (status.pushToken == null)
        Text(
          status.platform == 'android'
              ? 'No FCM token. Add android/app/google-services.json and rebuild.'
              : 'No VoIP token. Sign the app with push capability and run on a device.',
        )
      else ...[
        SelectableText(status.pushToken!, style: mono),
        TextButton(
          onPressed: () =>
              Clipboard.setData(ClipboardData(text: status.pushToken!)),
          child: const Text('Copy token'),
        ),
      ],
      const SizedBox(height: 12),
      const Text('Host log', style: TextStyle(fontWeight: FontWeight.w700)),
      const SizedBox(height: 6),
      for (final line in (status?.events ?? const <String>[]).take(12))
        Text(line, style: mono),
    ];
  }

  @override
  Widget build(BuildContext context) {
    final call = snapshot.call;
    final live = call != null && call.state != CallState.ended;
    final media =
        call?.state == CallState.active || call?.state == CallState.held;
    final answered = media || call?.state == CallState.connecting;
    final cameraOn = call?.localVideo == LocalVideo.on;
    final showVideo = live && (call.video || call.remoteVideo || cameraOn);
    if (pictureInPicture) {
      return Stack(
        children: [
          const Positioned.fill(child: CallBackdrop()),
          if (showVideo && (call.remoteVideo || cameraOn))
            Positioned.fill(
              child: CallxVideoView(
                callId: call.callId,
                source: call.remoteVideo
                    ? VideoSource.remote
                    : VideoSource.local,
                mirror:
                    !call.remoteVideo &&
                    call.cameraFacing == CameraFacing.front,
              ),
            ),
        ],
      );
    }
    void back() => setState(() {
      showCall = false;
      diagnostics = live;
    });
    if (showCall && call != null) {
      return CallScreen(
        call: call,
        nativeVideo: mode == Mode.device,
        onBack: back,
        error: error,
        elapsed: call.acceptedAtMs != null
            ? CallTimer(startedAtMs: call.acceptedAtMs!)
            : null,
        localControls: IconButton.filledTonal(
          tooltip: 'Switch camera',
          icon: const Icon(Icons.cameraswitch),
          onPressed: busy
              ? null
              : () => run(
                  () => callx.switchCamera(
                    call.callId,
                    call.cameraFacing == CameraFacing.back
                        ? CameraFacing.front
                        : CameraFacing.back,
                  ),
                ),
        ),
        controls: [
          if (call.state == CallState.incoming)
            FilledButton(
              onPressed: busy
                  ? null
                  : () => run(() => callx.answer(call.callId)),
              child: const Text('Answer'),
            ),
          if (answered) ...[
            button(
              call.muted ? 'Unmute' : 'Mute',
              () => callx.setMuted(call.callId, !call.muted),
              enabled: media,
            ),
            button(
              call.state == CallState.held ? 'Resume' : 'Hold',
              () => callx.setHeld(call.callId, call.state != CallState.held),
              enabled: media,
            ),
            button(cameraOn ? 'Camera off' : 'Camera on', () async {
              if (!cameraOn &&
                  mode == Mode.device &&
                  defaultTargetPlatform == TargetPlatform.iOS) {
                await host.requestCameraPermission();
              }
              return callx.setCamera(call.callId, !cameraOn);
            }),
            if (cameraOn && !call.remoteVideo)
              button(
                'Switch camera',
                () => callx.switchCamera(
                  call.callId,
                  call.cameraFacing == CameraFacing.back
                      ? CameraFacing.front
                      : CameraFacing.back,
                ),
              ),
            if ((hostStatus?.endpoints.length ?? 0) > 1)
              button('Audio output', () {
                final endpoints = hostStatus!.endpoints;
                return host.selectAudioEndpoint(
                  (endpoints.indexWhere((e) => e.current) + 1) %
                      endpoints.length,
                );
              }),
          ],
          if (mode == Mode.device &&
              defaultTargetPlatform == TargetPlatform.android &&
              showVideo)
            button('Picture in picture', CallxPictureInPicture.enter),
          if (live)
            FilledButton(
              style: FilledButton.styleFrom(
                backgroundColor: const Color(0xffb53936),
                foregroundColor: Colors.white,
              ),
              onPressed: busy ? null : () => run(() => callx.end(call.callId)),
              child: Text(
                call.state == CallState.incoming ? 'Decline' : 'End call',
              ),
            ),
        ],
      );
    }
    return Scaffold(
      appBar: AppBar(
        title: const Text('Callx'),
        actions: [
          TextButton(
            onPressed: () => setState(() => diagnostics = !diagnostics),
            child: Text(diagnostics ? 'Calls' : 'Diagnostics'),
          ),
        ],
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 640),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    diagnostics ? 'Test controls' : 'Flutter example',
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  const SizedBox(height: 24),
                  if (live && call.state != CallState.incoming)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 24),
                      child: Semantics(
                        label: 'Return to call',
                        button: true,
                        onTap: () => setState(() => showCall = true),
                        child: ExcludeSemantics(
                          child: FilledButton(
                            onPressed: () => setState(() => showCall = true),
                            child: Text('${call.displayName} · Return to call'),
                          ),
                        ),
                      ),
                    ),
                  if (call?.state == CallState.incoming &&
                      mode == Mode.simulator)
                    Wrap(
                      spacing: 10,
                      children: [
                        button('Answer', () => callx.answer(call!.callId)),
                        button('Decline', () => callx.end(call!.callId)),
                      ],
                    ),
                  if (!live && call?.state == CallState.ended)
                    const Text('Last call ended'),
                  if (deviceAvailable)
                    SegmentedButton<Mode>(
                      segments: const [
                        ButtonSegment(
                          value: Mode.device,
                          label: Text('Device'),
                        ),
                        ButtonSegment(
                          value: Mode.simulator,
                          label: Text('Simulator'),
                        ),
                      ],
                      selected: {mode},
                      onSelectionChanged: live || busy
                          ? null
                          : (value) => switchMode(value.single),
                    ),
                  const SizedBox(height: 20),
                  Text(
                    mode == Mode.device
                        ? 'Calls on this device'
                        : 'Simulated calls',
                  ),
                  const SizedBox(height: 20),
                  Wrap(
                    spacing: 10,
                    runSpacing: 10,
                    children: [
                      button(
                        'Incoming call',
                        () => mode == Mode.device
                            ? host.incoming(newCallId(), 'hao.dev7')
                            : preview.simulator.incoming(nextInput()),
                        enabled: !live,
                      ),
                      button(
                        'Incoming video',
                        () => mode == Mode.device
                            ? host.incoming(
                                newCallId(),
                                'hao.dev7',
                                video: true,
                              )
                            : preview.simulator.incoming(
                                nextInput(video: true),
                              ),
                        enabled: !live,
                      ),
                      button(
                        'Start outgoing',
                        () => callx.startCall(
                          mode == Mode.device
                              ? CallInput(
                                  callId: newCallId(),
                                  displayName: 'hao.dev7',
                                  handle: 'callx:hao.dev7',
                                )
                              : nextInput(),
                        ),
                        enabled: !live,
                      ),
                      button(
                        'Start outgoing video',
                        () => callx.startCall(
                          mode == Mode.device
                              ? CallInput(
                                  callId: newCallId(),
                                  displayName: 'hao.dev7',
                                  handle: 'callx:hao.dev7',
                                  video: true,
                                )
                              : nextInput(video: true),
                        ),
                        enabled: !live,
                      ),
                    ],
                  ),
                  if (error != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 16),
                      child: Text(
                        error!,
                        style: const TextStyle(color: Color(0xffb53936)),
                      ),
                    ),
                  if (diagnostics) ...[
                    const SizedBox(height: 28),
                    if (mode == Mode.device)
                      ...deviceControls(call, live)
                    else ...[
                      const Text(
                        'Call simulation',
                        style: TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(height: 14),
                      Wrap(
                        spacing: 10,
                        runSpacing: 10,
                        children: [
                          button(
                            'Remote answers',
                            preview.simulator.remoteAnswered,
                            enabled: call?.state == CallState.outgoing,
                          ),
                          button(
                            'Connect media',
                            preview.simulator.mediaConnected,
                            enabled: call?.state == CallState.connecting,
                          ),
                          button(
                            'Remote ends',
                            preview.simulator.remoteEnded,
                            enabled: live,
                          ),
                          button('Reset preview', preview.simulator.reset),
                        ],
                      ),
                    ],
                    if (mode == Mode.device &&
                        defaultTargetPlatform == TargetPlatform.android)
                      Padding(
                        padding: const EdgeInsets.only(top: 16),
                        child: button(
                          autoPictureInPicture ? 'Auto PiP on' : 'Auto PiP off',
                          () async {
                            setState(
                              () =>
                                  autoPictureInPicture = !autoPictureInPicture,
                            );
                            await CallxPictureInPicture.configure(
                              automatic: autoPictureInPicture,
                            );
                            return null;
                          },
                        ),
                      ),
                    const SizedBox(height: 28),
                    const Text(
                      'State',
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    Text(
                      '${call?.state.name.toUpperCase() ?? "READY"} · sequence ${snapshot.sequence}',
                    ),
                    if (call != null) SelectableText(call.callId),
                    if (call?.endReason != null)
                      Text('Reason: ${call!.endReason!.name}'),
                    const SizedBox(height: 28),
                    const Text(
                      'Event log',
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    for (final line in journal)
                      Text(
                        line,
                        style: const TextStyle(
                          fontFamily: 'monospace',
                          fontSize: 12,
                          height: 1.6,
                        ),
                      ),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Elapsed time since the call was answered, like the Android call notification's timer.
class CallTimer extends StatefulWidget {
  const CallTimer({super.key, required this.startedAtMs});

  final int startedAtMs;

  @override
  State<CallTimer> createState() => _CallTimerState();
}

class _CallTimerState extends State<CallTimer> {
  late final Timer ticker;

  @override
  void initState() {
    super.initState();
    ticker = Timer.periodic(const Duration(seconds: 1), (_) => setState(() {}));
  }

  @override
  void dispose() {
    ticker.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final elapsed = Duration(
      milliseconds: max(
        0,
        DateTime.now().millisecondsSinceEpoch - widget.startedAtMs,
      ),
    );
    final minutes = elapsed.inMinutes.toString().padLeft(2, '0');
    final seconds = (elapsed.inSeconds % 60).toString().padLeft(2, '0');
    return Text(
      '$minutes:$seconds',
      style: const TextStyle(
        color: Colors.white,
        fontSize: 20,
        fontFeatures: [FontFeature.tabularFigures()],
      ),
    );
  }
}
