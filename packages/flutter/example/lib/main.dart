import 'dart:async';
import 'dart:math';

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
  Future<String?> incoming(String callId, String displayName) =>
      _channel.invokeMethod<String>('incoming', {
        'callId': callId,
        'displayName': displayName,
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
    title: 'Callx / Flutter preview',
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

  Callx get callx => mode == Mode.device ? device : preview.callx;

  @override
  void initState() {
    super.initState();
    observe();
    unawaited(initialize());
  }

  void observe() {
    unawaited(subscription?.cancel());
    subscription = callx.snapshots.listen((value) {
      if (!mounted) return;
      setState(() {
        snapshot = value;
        journal.insert(
          0,
          '#${value.sequence}  ${value.call?.state.name ?? "idle"}'
          '  · media ${value.call?.mediaReady == true ? "ready (simulated)" : "not ready"}',
        );
        if (journal.length > 8) journal.removeLast();
      });
    });
  }

  Future<void> initialize() async {
    try {
      await preview.callx.setup(const CallxConfig(appName: 'Acme Support'));
      if (mounted) setState(() => ready = true);
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    }
    // Device mode needs the native host this example configures; tests and web have none.
    try {
      final capabilities = await device.setup(
        const CallxConfig(appName: 'Acme Support'),
      );
      if (capabilities.nativeCalling && mounted) {
        setState(() => deviceAvailable = true);
        switchMode(Mode.device);
      }
    } on CallxException {
      // nativeUnavailable: stay in the simulator.
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

  CallInput nextInput() => CallInput(
    callId: 'demo-${++counter}',
    displayName: 'hao.dev7',
    handle: 'sip:hao.dev7@example.invalid',
  );

  @override
  void dispose() {
    statusTimer?.cancel();
    unawaited(subscription?.cancel());
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
      const Text('01 / Drive the device trial', style: heading),
      const SizedBox(height: 8),
      const Text(
        'Invitations here use the same native path as a push. The remote side and media are '
        'simulated by the example host; see the example README to send real pushes.',
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
    return Scaffold(
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 1120),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'callx / playground',
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
                  ),
                  const SizedBox(height: 34),
                  const Text(
                    'One call. Every state.',
                    style: TextStyle(
                      fontSize: 40,
                      fontWeight: FontWeight.w800,
                      letterSpacing: -1.5,
                    ),
                  ),
                  const SizedBox(height: 10),
                  const Text(
                    'Flutter SDK · Acme Support\nExplore the integration before we build the native runtime.',
                    style: TextStyle(fontSize: 16, height: 1.6),
                  ),
                  const SizedBox(height: 20),
                  if (deviceAvailable) ...[
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
                      onSelectionChanged: (value) => switchMode(value.single),
                    ),
                    const SizedBox(height: 16),
                  ],
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: mode == Mode.device
                          ? const Color(0xffd7e9de)
                          : const Color(0xffffebcf),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Text(
                      mode == Mode.device
                          ? 'DEVICE TRIAL  ·  Real push, CallKit/Telecom and notifications. '
                                'Media is simulated: no audio.'
                          : 'PREVIEW ONLY  ·  No real calls, microphone, push or system call UI.',
                      style: const TextStyle(fontWeight: FontWeight.w700),
                    ),
                  ),
                  const SizedBox(height: 24),
                  LayoutBuilder(
                    builder: (context, constraints) {
                      final callPanel = Container(
                        width: double.infinity,
                        padding: const EdgeInsets.all(28),
                        decoration: BoxDecoration(
                          color: const Color(0xff172c2a),
                          borderRadius: BorderRadius.circular(24),
                        ),
                        child: Column(
                          children: [
                            Text(
                              call?.state.name.toUpperCase() ??
                                  'READY FOR A CALL',
                              style: const TextStyle(
                                color: Color(0xff9bddc5),
                                letterSpacing: 2,
                                fontSize: 12,
                              ),
                            ),
                            const SizedBox(height: 28),
                            const CircleAvatar(
                              radius: 38,
                              backgroundColor: Color(0xffd7e9de),
                              child: Text(
                                'LN',
                                style: TextStyle(
                                  fontSize: 26,
                                  color: Color(0xff172c2a),
                                ),
                              ),
                            ),
                            const SizedBox(height: 18),
                            Text(
                              call?.displayName ?? 'Your next conversation',
                              textAlign: TextAlign.center,
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 26,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            const SizedBox(height: 10),
                            Text(
                              call == null
                                  ? 'Trigger an invitation from the simulator.'
                                  : '${call.callId} · ${call.direction.name}',
                              style: const TextStyle(color: Color(0xffb7c9c4)),
                            ),
                            const SizedBox(height: 24),
                            Text(
                              call?.mediaReady == true
                                  ? '● Media ready — simulated, no audio'
                                  : '○ Media not connected',
                              style: const TextStyle(color: Color(0xffb7c9c4)),
                            ),
                            if (call?.endReason != null)
                              Padding(
                                padding: const EdgeInsets.only(top: 8),
                                child: Text(
                                  'Reason: ${call!.endReason!.name}',
                                  style: const TextStyle(color: Colors.white),
                                ),
                              ),
                            const SizedBox(height: 24),
                            FilledButton(
                              onPressed:
                                  ready &&
                                      !busy &&
                                      call?.state == CallState.incoming
                                  ? () => run(() => callx.answer(call!.callId))
                                  : null,
                              child: const Text('Answer'),
                            ),
                            const SizedBox(height: 8),
                            Wrap(
                              spacing: 8,
                              runSpacing: 8,
                              alignment: WrapAlignment.center,
                              children: [
                                FilledButton.tonal(
                                  onPressed: media && !busy
                                      ? () => run(
                                          () => callx.setMuted(
                                            call!.callId,
                                            !call.muted,
                                          ),
                                        )
                                      : null,
                                  child: Text(
                                    call?.muted == true ? 'Unmute' : 'Mute',
                                  ),
                                ),
                                FilledButton.tonal(
                                  onPressed: media && !busy
                                      ? () => run(
                                          () => callx.setHeld(
                                            call!.callId,
                                            call.state != CallState.held,
                                          ),
                                        )
                                      : null,
                                  child: Text(
                                    call?.state == CallState.held
                                        ? 'Resume'
                                        : 'Hold',
                                  ),
                                ),
                                FilledButton(
                                  style: FilledButton.styleFrom(
                                    backgroundColor: const Color(0xffa94135),
                                  ),
                                  onPressed: live && !busy
                                      ? () => run(() => callx.end(call.callId))
                                      : null,
                                  child: Text(
                                    call?.state == CallState.incoming
                                        ? 'Decline'
                                        : 'End call',
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),
                      );
                      final controls = Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          if (mode == Mode.device)
                            ...deviceControls(call, live)
                          else ...[
                            const Text(
                              '01 / Simulate the outside world',
                              style: TextStyle(
                                fontSize: 20,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            const SizedBox(height: 8),
                            const Text(
                              'These controls belong to the test harness, not your production app.',
                            ),
                            const SizedBox(height: 16),
                            Wrap(
                              spacing: 8,
                              runSpacing: 8,
                              children: [
                                button(
                                  'Incoming call',
                                  () => preview.simulator.incoming(nextInput()),
                                  enabled: !live,
                                ),
                                button(
                                  'Start outgoing',
                                  () => preview.callx.startCall(nextInput()),
                                  enabled: !live,
                                ),
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
                                button(
                                  'Reset preview',
                                  preview.simulator.reset,
                                ),
                              ],
                            ),
                          ],
                          const SizedBox(height: 20),
                          const Text(
                            '02 / Observe the contract',
                            style: TextStyle(
                              fontSize: 20,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          const SizedBox(height: 12),
                          Text(
                            'sequence  ${snapshot.sequence}\nmuted  ${call?.muted ?? false}\nexecution  ${mode == Mode.device ? 'native' : 'preview'}',
                            style: const TextStyle(
                              fontFamily: 'monospace',
                              height: 1.8,
                            ),
                          ),
                          const SizedBox(height: 14),
                          if (error != null)
                            Text(
                              error!,
                              style: const TextStyle(color: Color(0xffa94135)),
                            ),
                          Text(
                            !ready
                                ? 'Configuring SDK…'
                                : mode == Mode.device
                                ? 'SDK configured · native runtime, durable journal'
                                : 'SDK configured · memory only',
                          ),
                        ],
                      );
                      if (constraints.maxWidth < 760) {
                        return Column(
                          children: [
                            callPanel,
                            const SizedBox(height: 28),
                            controls,
                          ],
                        );
                      }
                      return Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Expanded(child: callPanel),
                          const SizedBox(width: 36),
                          Expanded(child: controls),
                        ],
                      );
                    },
                  ),
                  const SizedBox(height: 32),
                  const Text(
                    'Event timeline',
                    style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 12),
                  ...journal.map(
                    (line) => Padding(
                      padding: const EdgeInsets.symmetric(vertical: 5),
                      child: Text(
                        line,
                        style: const TextStyle(
                          fontFamily: 'monospace',
                          fontSize: 12,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 24),
                  const Text(
                    'callx 0.0.0-preview.1  /  Flutter + shared contract  /  Not a native-call certification',
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
