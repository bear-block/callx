import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';

/// Which video a [CallxVideoView] shows.
enum VideoSource { local, remote }

/// How video fills a [CallxVideoView]: cropped to cover it, or letterboxed inside it.
enum VideoFit { cover, contain }

/// Shows one video source of a call, rendered natively by the video media adapter (ADR-0010).
///
/// The view is empty until the source exists: the remote video once [Call.remoteVideo] is true,
/// the local camera once [Call.localVideo] is [LocalVideo.on]. Two views may show the same
/// source. On platforms without native calls it renders nothing.
class CallxVideoView extends StatelessWidget {
  const CallxVideoView({
    super.key,
    required this.callId,
    this.source = VideoSource.remote,
    this.fit = VideoFit.cover,
    this.mirror = false,
  });

  final String callId;
  final VideoSource source;
  final VideoFit fit;

  /// Mirror horizontally, usually for the front camera's local preview.
  final bool mirror;

  static const _viewType = 'dev.callx/video';

  @override
  Widget build(BuildContext context) {
    final params = <String, Object?>{
      'callId': callId,
      'source': source.name,
      'fit': fit.name,
      'mirror': mirror,
    };
    // Native parameters are fixed per view, so a change recreates it.
    final key = ValueKey('$callId/${source.name}/${fit.name}/$mirror');
    if (kIsWeb) return const SizedBox.expand();
    return switch (defaultTargetPlatform) {
      TargetPlatform.android => AndroidView(
        key: key,
        viewType: _viewType,
        creationParams: params,
        creationParamsCodec: const StandardMessageCodec(),
      ),
      TargetPlatform.iOS => UiKitView(
        key: key,
        viewType: _viewType,
        creationParams: params,
        creationParamsCodec: const StandardMessageCodec(),
      ),
      _ => const SizedBox.expand(),
    };
  }
}
