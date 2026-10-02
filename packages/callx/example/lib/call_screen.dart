import 'dart:math' as math;
import 'package:callx/callx.dart';
import 'package:flutter/material.dart';

/// Branding belongs to the host app, including the fallback shown without video.
class CallBrand {
  const CallBrand({
    this.backgroundColor = const Color(0xff102b24),
    this.accentColor = const Color(0xffa7f3d0),
    this.logo = const CallxLogo(),
  });
  final Color backgroundColor;
  final Color accentColor;
  final Widget logo;
}

class CallBackdrop extends StatelessWidget {
  const CallBackdrop({super.key, this.brand = const CallBrand()});
  final CallBrand brand;
  @override
  Widget build(BuildContext context) => ColoredBox(
    color: brand.backgroundColor,
    child: Center(child: brand.logo),
  );
}

class CallScreen extends StatelessWidget {
  const CallScreen({
    super.key,
    required this.call,
    required this.controls,
    required this.onBack,
    required this.nativeVideo,
    this.elapsed,
    this.localControls,
    this.error,
    this.brand = const CallBrand(),
  });
  final Call call;
  final List<Widget> controls;
  final VoidCallback onBack;
  final bool nativeVideo;
  final Widget? elapsed;
  final Widget? localControls;
  final String? error;
  final CallBrand brand;

  @override
  Widget build(BuildContext context) {
    final ended = call.state == CallState.ended;
    final remote = !ended && nativeVideo && call.remoteVideo;
    final local = !ended && nativeVideo && call.localVideo == LocalVideo.on;
    final status = ended
        ? 'Call ended'
        : call.state == CallState.incoming
        ? 'Incoming call'
        : call.state == CallState.outgoing
        ? 'Calling…'
        : call.state == CallState.held
        ? 'On hold'
        : call.mediaInterrupted
        ? 'Reconnecting…'
        : call.mediaReady
        ? 'Connected'
        : 'Connecting…';
    return Scaffold(
      backgroundColor: brand.backgroundColor,
      body: Stack(
        children: [
          Positioned.fill(child: CallBackdrop(brand: brand)),
          if (remote || local)
            Positioned.fill(
              child: CallxVideoView(
                callId: call.callId,
                source: remote ? VideoSource.remote : VideoSource.local,
                mirror: !remote && call.cameraFacing == CameraFacing.front,
              ),
            ),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      IconButton.filledTonal(
                        onPressed: onBack,
                        tooltip: ended ? 'Done' : 'Test controls',
                        icon: Icon(ended ? Icons.close : Icons.chevron_left),
                      ),
                      Expanded(
                        child: DecoratedBox(
                          decoration: BoxDecoration(
                            color: const Color(0xdd102b24),
                            borderRadius: BorderRadius.circular(20),
                          ),
                          child: Padding(
                            padding: const EdgeInsets.all(12),
                            child: Column(
                              children: [
                                Text(
                                  call.displayName,
                                  textAlign: TextAlign.center,
                                  style: const TextStyle(
                                    color: Colors.white,
                                    fontSize: 22,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                                const SizedBox(height: 6),
                                Text(
                                  status,
                                  style: TextStyle(color: brand.accentColor),
                                ),
                                if (!ended && elapsed != null)
                                  ExcludeSemantics(child: elapsed!),
                              ],
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(width: 48),
                    ],
                  ),
                  const Spacer(),
                  if (call.localVideo == LocalVideo.blocked)
                    const Text(
                      'Camera paused',
                      style: TextStyle(color: Colors.white),
                    ),
                  if (error != null)
                    Padding(
                      padding: const EdgeInsets.all(12),
                      child: Text(
                        error!,
                        style: const TextStyle(color: Colors.white),
                      ),
                    ),
                  if (!ended)
                    Container(
                      padding: const EdgeInsets.all(16),
                      margin: const EdgeInsets.only(bottom: 20),
                      decoration: BoxDecoration(
                        color: const Color(0xee102b24),
                        borderRadius: BorderRadius.circular(26),
                      ),
                      child: Theme(
                        data: ThemeData(
                          colorScheme: ColorScheme.fromSeed(
                            seedColor: brand.accentColor,
                            brightness: Brightness.dark,
                          ),
                          useMaterial3: true,
                        ),
                        child: Wrap(
                          spacing: 10,
                          runSpacing: 10,
                          alignment: WrapAlignment.center,
                          children: controls,
                        ),
                      ),
                    ),
                  if (ended)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 24),
                      child: FilledButton(
                        onPressed: onBack,
                        child: const Text('Done'),
                      ),
                    ),
                ],
              ),
            ),
          ),
          if (remote && local)
            Positioned(
              top: MediaQuery.paddingOf(context).top + 150,
              right: 20,
              width: 100,
              height: 150,
              child: Semantics(
                label: 'Local camera preview',
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(18),
                  child: Stack(
                    children: [
                      Positioned.fill(
                        child: CallxVideoView(
                          callId: call.callId,
                          source: VideoSource.local,
                          mirror: call.cameraFacing == CameraFacing.front,
                        ),
                      ),
                      if (localControls != null)
                        Positioned(bottom: 4, right: 4, child: localControls!),
                    ],
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class CallxLogo extends StatelessWidget {
  const CallxLogo({super.key});
  @override
  Widget build(BuildContext context) => Semantics(
    label: 'Callx',
    child: const SizedBox(
      width: 104,
      height: 104,
      child: CustomPaint(painter: _CallxLogoPainter()),
    ),
  );
}

class _CallxLogoPainter extends CustomPainter {
  const _CallxLogoPainter();
  @override
  void paint(Canvas canvas, Size size) {
    canvas.scale(size.width / 64, size.height / 64);
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        const Rect.fromLTWH(0, 0, 64, 64),
        const Radius.circular(15),
      ),
      Paint()..color = const Color(0xff175c46),
    );
    canvas.drawCircle(const Offset(22, 42), 6, Paint()..color = Colors.white);
    final paint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 5
      ..strokeCap = StrokeCap.round;
    canvas.drawArc(
      Rect.fromCircle(center: const Offset(22, 42), radius: 16),
      -math.pi / 2,
      math.pi / 2,
      false,
      paint..color = const Color(0xffa7f3d0),
    );
    canvas.drawArc(
      Rect.fromCircle(center: const Offset(22, 42), radius: 29),
      -math.pi / 2,
      math.pi / 2,
      false,
      paint..color = const Color(0xff4fd1a5),
    );
  }

  @override
  bool shouldRepaint(_CallxLogoPainter oldDelegate) => false;
}
