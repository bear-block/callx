import '../../callx.dart';
import 'package:flutter/material.dart';

/// Branding belongs to the host app, including the fallback shown without video.
class CallxCallBrand {
  const CallxCallBrand({
    this.backgroundColor = const Color(0xff20252b),
    this.accentColor = const Color(0xffa7f3d0),
    this.logo = const Icon(Icons.call, size: 64, color: Colors.white),
  });
  final Color backgroundColor;
  final Color accentColor;
  final Widget logo;
}

class CallxCallBackdrop extends StatelessWidget {
  const CallxCallBackdrop({super.key, this.brand = const CallxCallBrand()});
  final CallxCallBrand brand;
  @override
  Widget build(BuildContext context) => ColoredBox(
    color: brand.backgroundColor,
    child: Center(child: brand.logo),
  );
}

class CallxCallScreen extends StatelessWidget {
  const CallxCallScreen({
    super.key,
    required this.call,
    required this.controls,
    required this.onBack,
    required this.nativeVideo,
    this.elapsed,
    this.localControls,
    this.error,
    this.brand = const CallxCallBrand(),
  });
  final Call call;
  final List<Widget> controls;
  final VoidCallback onBack;
  final bool nativeVideo;
  final Widget? elapsed;
  final Widget? localControls;
  final String? error;
  final CallxCallBrand brand;

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
          Positioned.fill(child: CallxCallBackdrop(brand: brand)),
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
                        tooltip: ended ? 'Done' : 'Minimize call',
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
