import 'dart:async';
import 'package:callx/callx.dart';
import 'package:callx/callx_preview.dart';
import 'package:flutter/material.dart';

void main() => runApp(const CallxDemoApp());

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
  StreamSubscription<CallSnapshot>? subscription;
  CallSnapshot snapshot = const CallSnapshot(sequence: '0');
  final List<String> journal = [];
  String? error;
  bool ready = false;
  bool busy = false;
  int counter = 0;

  @override
  void initState() {
    super.initState();
    subscription = preview.callx.snapshots.listen((value) {
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
    unawaited(initialize());
  }

  Future<void> initialize() async {
    try {
      await preview.callx.setup(const CallxConfig(appName: 'Acme Support'));
      if (mounted) setState(() => ready = true);
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
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

  CallInput nextInput() =>
      CallInput(callId: 'demo-${++counter}', displayName: 'hao.dev7');

  @override
  void dispose() {
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
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: const Color(0xffffebcf),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: const Text(
                      'PREVIEW ONLY  ·  No real calls, microphone, push or system call UI.',
                      style: TextStyle(fontWeight: FontWeight.w700),
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
                                  ? () => run(
                                      () => preview.callx.answer(call!.callId),
                                    )
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
                                          () => preview.callx.setMuted(
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
                                          () => preview.callx.setHeld(
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
                                      ? () => run(
                                          () => preview.callx.end(call.callId),
                                        )
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
                              button('Reset preview', preview.simulator.reset),
                            ],
                          ),
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
                            'sequence  ${snapshot.sequence}\nmuted  ${call?.muted ?? false}\nexecution  preview',
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
                            ready
                                ? 'SDK configured · memory only'
                                : 'Configuring SDK…',
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
