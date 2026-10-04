import 'dart:async';
import 'dart:math' as math;
import '../../callx.dart';
import 'package:flutter/material.dart';

/// Branding and visible controls belong to the host app.
class CallxCallBrand {
  const CallxCallBrand({
    this.backgroundColor = const Color(0xff20252b),
    this.accentColor = const Color(0xffa7f3d0),
    this.logo = const Icon(Icons.call, size: 64, color: Colors.white),
    this.foregroundColor = Colors.white,
    this.surfaceColor = const Color(0x45000000),
    this.dangerColor = const Color(0xffeb434b),
  });
  final Color backgroundColor,
      accentColor,
      foregroundColor,
      surfaceColor,
      dangerColor;
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

/// A presentation control; the host supplies the command and observed state.
class CallxCallControl extends StatelessWidget {
  const CallxCallControl({
    super.key,
    required this.label,
    required this.icon,
    required this.onPressed,
    this.compact = false,
    this.size,
    this.selected = false,
    this.destructive = false,
    this.brand = const CallxCallBrand(),
  });
  final String label;
  final Widget icon;
  final VoidCallback? onPressed;
  final bool selected, destructive, compact;
  final double? size;
  final CallxCallBrand brand;
  @override
  Widget build(BuildContext context) {
    final diameter = size ?? 58.0;
    final foreground = selected && !destructive
        ? brand.backgroundColor
        : brand.foregroundColor;
    if (compact) {
      return SizedBox(
        width: diameter,
        height: diameter,
        child: IconButton.filledTonal(
          tooltip: label,
          onPressed: onPressed,
          isSelected: selected,
          style: IconButton.styleFrom(
            foregroundColor: foreground,
            backgroundColor: destructive
                ? brand.dangerColor
                : selected
                ? brand.foregroundColor
                : brand.surfaceColor,
            disabledForegroundColor: brand.foregroundColor.withValues(
              alpha: .4,
            ),
            disabledBackgroundColor: brand.surfaceColor.withValues(alpha: .2),
            minimumSize: Size.square(diameter),
            iconSize: 28,
          ),
          icon: IconTheme(
            data: IconThemeData(color: foreground, size: 28),
            child: icon,
          ),
        ),
      );
    }
    return Semantics(
      button: true,
      label: label,
      enabled: onPressed != null,
      selected: selected,
      onTap: onPressed,
      child: ExcludeSemantics(
        child: SizedBox(
          width: math.max(84, diameter),
          child: Opacity(
            opacity: onPressed == null ? .4 : 1,
            child: InkWell(
              onTap: onPressed,
              borderRadius: BorderRadius.circular(24),
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 2),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      width: diameter,
                      height: diameter,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: destructive
                            ? brand.dangerColor
                            : selected
                            ? brand.foregroundColor
                            : brand.surfaceColor,
                      ),
                      child: IconTheme(
                        data: IconThemeData(color: foreground, size: 28),
                        child: Center(child: icon),
                      ),
                    ),
                    if (!compact) const SizedBox(height: 8),
                    if (!compact)
                      Text(
                        label,
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          color: brand.foregroundColor,
                          fontSize: 12,
                        ),
                      ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Render a provider-specific video surface while retaining the call layout.
typedef CallxVideoBuilder =
    Widget Function(
      BuildContext context,
      String callId,
      VideoSource source,
      VideoFit fit,
      bool mirror,
    );

/// Optional root call screen. Slots render state; they never accept or join calls.
class CallxCallScreen extends StatelessWidget {
  const CallxCallScreen({
    super.key,
    required this.call,
    required this.controls,
    required this.onBack,
    required this.nativeVideo,
    this.videoBuilder,
    this.compactVideoControls = true,
    this.autoHideControls = true,
    this.controlsTimeout = const Duration(seconds: 5),
    this.controlsPinned = false,
    this.elapsed,
    this.localControls,
    this.leadingControls,
    this.error,
    this.endControl,
    this.header,
    this.statusLabel,
    this.previewAlignment = Alignment.topRight,
    this.previewSize = const Size(96, 140),
    this.minimizeLabel = 'Minimize call',
    this.doneLabel = 'Done',
    this.cameraPausedLabel = 'Camera paused',
    this.localPreviewLabel = 'Local camera preview',
    this.brand = const CallxCallBrand(),
  });
  final bool compactVideoControls, autoHideControls, controlsPinned;
  final Duration controlsTimeout;
  final Call call;
  final CallxVideoBuilder? videoBuilder;
  final List<Widget> controls;
  final VoidCallback onBack;
  final bool nativeVideo;
  final Widget? elapsed, localControls, leadingControls, endControl, header;
  final String? error, statusLabel;
  final Alignment previewAlignment;
  final Size previewSize;
  final String minimizeLabel, doneLabel, cameraPausedLabel, localPreviewLabel;
  final CallxCallBrand brand;

  @override
  Widget build(BuildContext context) {
    Widget videoSurface(VideoSource source, bool mirror) =>
        videoBuilder?.call(
          context,
          call.callId,
          source,
          VideoFit.cover,
          mirror,
        ) ??
        CallxVideoView(
          callId: call.callId,
          source: source,
          fit: VideoFit.cover,
          mirror: mirror,
        );
    final ended = call.state == CallState.ended;
    final remote = !ended && nativeVideo && call.remoteVideo;
    final local = !ended && nativeVideo && call.localVideo == LocalVideo.on;
    final video = remote || local;
    final videoLayout =
        compactVideoControls && (video || (!ended && call.video));
    final status =
        statusLabel ??
        (ended
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
            : 'Connecting…');
    Widget message(String value, {bool alert = false}) => Semantics(
      liveRegion: alert,
      child: Container(
        padding: const EdgeInsets.all(10),
        margin: const EdgeInsets.only(bottom: 8),
        decoration: BoxDecoration(
          color: brand.surfaceColor,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Text(
          value,
          textAlign: TextAlign.center,
          style: TextStyle(color: brand.foregroundColor),
        ),
      ),
    );
    return _VideoChrome(
      enabled:
          video &&
          call.state == CallState.active &&
          autoHideControls &&
          !controlsPinned &&
          error == null &&
          !call.mediaInterrupted &&
          !MediaQuery.of(context).accessibleNavigation,
      timeout: controlsTimeout,
      callId: call.callId,
      builder: (visible) {
        Widget chrome(Widget child) => IgnorePointer(
          ignoring: !visible,
          child: ExcludeSemantics(
            excluding: !visible,
            child: AnimatedOpacity(
              opacity: visible ? 1 : 0,
              duration: MediaQuery.of(context).disableAnimations
                  ? Duration.zero
                  : const Duration(milliseconds: 180),
              child: child,
            ),
          ),
        );
        return Scaffold(
          backgroundColor: brand.backgroundColor,
          body: Stack(
            fit: StackFit.expand,
            children: [
              // AVKit still needs a mounted source when both cameras are unavailable.
              // The app branding above it remains visible; PiP uses its own native fallback.
              if (Theme.of(context).platform == TargetPlatform.iOS &&
                  nativeVideo &&
                  !ended &&
                  !video &&
                  (call.video || call.localVideo == LocalVideo.blocked))
                Positioned.fill(child: videoSurface(VideoSource.remote, false)),
              Positioned.fill(child: CallxCallBackdrop(brand: brand)),
              if (video)
                Positioned.fill(
                  child: videoSurface(
                    remote ? VideoSource.remote : VideoSource.local,
                    !remote && call.cameraFacing == CameraFacing.front,
                  ),
                ),
              if (video)
                const Positioned.fill(
                  child: IgnorePointer(
                    child: ColoredBox(color: Color(0x16000000)),
                  ),
                ),
              SafeArea(
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 20,
                    vertical: 12,
                  ),
                  child: LayoutBuilder(
                    builder: (context, bounds) {
                      final largeText =
                          MediaQuery.textScalerOf(context).scale(16) > 24;
                      final scroll =
                          (!videoLayout && bounds.maxHeight < 520) || largeText;
                      final content = SizedBox(
                        height: scroll
                            ? (largeText ? 1000.0 : 700.0)
                            : bounds.maxHeight,
                        child: Column(
                          children: [
                            chrome(
                              header ??
                                  Padding(
                                    padding: const EdgeInsets.only(top: 8),
                                    child: Row(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        Column(
                                          mainAxisSize: MainAxisSize.min,
                                          children: [
                                            IconButton.filledTonal(
                                              onPressed: onBack,
                                              tooltip: ended
                                                  ? doneLabel
                                                  : minimizeLabel,
                                              style: IconButton.styleFrom(
                                                fixedSize: const Size.square(
                                                  58,
                                                ),
                                                iconSize: 28,
                                                backgroundColor:
                                                    brand.surfaceColor,
                                                foregroundColor:
                                                    brand.foregroundColor,
                                              ),
                                              icon: const Icon(
                                                Icons.keyboard_arrow_down,
                                              ),
                                            ),
                                            if (leadingControls != null) ...[
                                              const SizedBox(height: 12),
                                              leadingControls!,
                                            ],
                                          ],
                                        ),
                                        Expanded(
                                          child: Padding(
                                            padding: const EdgeInsets.symmetric(
                                              horizontal: 8,
                                            ),
                                            child: Column(
                                              children: [
                                                Text(
                                                  call.displayName,
                                                  maxLines: 2,
                                                  overflow:
                                                      TextOverflow.ellipsis,
                                                  textAlign: TextAlign.center,
                                                  style: TextStyle(
                                                    color:
                                                        brand.foregroundColor,
                                                    fontSize: video ? 22 : 32,
                                                    fontWeight: FontWeight.w300,
                                                    shadows: const [
                                                      Shadow(
                                                        color: Color(
                                                          0x77000000,
                                                        ),
                                                        blurRadius: 5,
                                                      ),
                                                    ],
                                                  ),
                                                ),
                                                const SizedBox(height: 6),
                                                Container(
                                                  padding:
                                                      const EdgeInsets.symmetric(
                                                        horizontal: 10,
                                                        vertical: 3,
                                                      ),
                                                  decoration: BoxDecoration(
                                                    color: video
                                                        ? brand.surfaceColor
                                                        : Colors.transparent,
                                                    borderRadius:
                                                        BorderRadius.circular(
                                                          12,
                                                        ),
                                                  ),
                                                  child: Text(
                                                    status,
                                                    textAlign: TextAlign.center,
                                                    style: TextStyle(
                                                      color: brand.accentColor,
                                                      fontSize: 14,
                                                    ),
                                                  ),
                                                ),
                                                if (!ended && elapsed != null)
                                                  ExcludeSemantics(
                                                    child: elapsed!,
                                                  ),
                                              ],
                                            ),
                                          ),
                                        ),
                                        SizedBox(
                                          width: remote && local
                                              ? previewSize.width + 8
                                              : 48,
                                        ),
                                      ],
                                    ),
                                  ),
                            ),
                            const Spacer(),
                            if (call.localVideo == LocalVideo.blocked)
                              message(cameraPausedLabel),
                            if (error != null) message(error!, alert: true),
                            if (!ended)
                              chrome(
                                Container(
                                  padding: EdgeInsets.symmetric(
                                    vertical: videoLayout ? 8 : 16,
                                  ),
                                  margin: const EdgeInsets.only(bottom: 8),
                                  decoration: BoxDecoration(
                                    color: video
                                        ? brand.surfaceColor
                                        : Colors.transparent,
                                    borderRadius: BorderRadius.circular(28),
                                  ),
                                  child: Column(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      ConstrainedBox(
                                        constraints: BoxConstraints(
                                          maxHeight: (bounds.maxHeight * .32)
                                              .clamp(100, double.infinity),
                                        ),
                                        child: SingleChildScrollView(
                                          scrollDirection: videoLayout
                                              ? Axis.horizontal
                                              : Axis.vertical,
                                          child: Theme(
                                            data: ThemeData(
                                              useMaterial3: true,
                                              colorScheme: ColorScheme.fromSeed(
                                                seedColor: brand.accentColor,
                                                brightness: Brightness.dark,
                                              ),
                                            ),
                                            child: videoLayout
                                                ? Row(
                                                    mainAxisSize:
                                                        MainAxisSize.min,
                                                    children: [
                                                      for (final control
                                                          in controls)
                                                        Padding(
                                                          padding:
                                                              const EdgeInsets.symmetric(
                                                                horizontal: 2,
                                                              ),
                                                          child: control,
                                                        ),
                                                      if (endControl != null)
                                                        Padding(
                                                          padding:
                                                              const EdgeInsets.symmetric(
                                                                horizontal: 2,
                                                              ),
                                                          child: endControl,
                                                        ),
                                                    ],
                                                  )
                                                : Wrap(
                                                    spacing: 16,
                                                    runSpacing: 16,
                                                    alignment:
                                                        WrapAlignment.center,
                                                    children: controls,
                                                  ),
                                          ),
                                        ),
                                      ),
                                      if (!videoLayout && endControl != null)
                                        Padding(
                                          padding: const EdgeInsets.only(
                                            top: 20,
                                          ),
                                          child: endControl,
                                        ),
                                    ],
                                  ),
                                ),
                              ),
                            if (ended)
                              Padding(
                                padding: const EdgeInsets.only(bottom: 24),
                                child: FilledButton(
                                  onPressed: onBack,
                                  child: Text(doneLabel),
                                ),
                              ),
                          ],
                        ),
                      );
                      return scroll
                          ? SingleChildScrollView(child: content)
                          : content;
                    },
                  ),
                ),
              ),
              if (local && !remote && localControls != null)
                Positioned.fill(
                  child: SafeArea(
                    child: Align(
                      alignment: Alignment.topRight,
                      child: Padding(
                        padding: const EdgeInsets.all(20),
                        child: chrome(localControls!),
                      ),
                    ),
                  ),
                ),
              if (remote && local)
                Positioned.fill(
                  child: SafeArea(
                    child: Align(
                      alignment: previewAlignment,
                      child: Padding(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 20,
                          vertical: 20,
                        ),
                        child: Semantics(
                          label: localPreviewLabel,
                          child: Container(
                            width: previewSize.width,
                            height: MediaQuery.sizeOf(context).height < 580
                                ? math.min(96, previewSize.height)
                                : previewSize.height,
                            decoration: BoxDecoration(
                              borderRadius: BorderRadius.circular(20),
                              border: Border.all(
                                color: const Color(0x80ffffff),
                              ),
                            ),
                            clipBehavior: Clip.antiAlias,
                            child: Stack(
                              children: [
                                Positioned.fill(
                                  child: videoSurface(
                                    VideoSource.local,
                                    call.cameraFacing == CameraFacing.front,
                                  ),
                                ),
                                if (localControls != null)
                                  Positioned(
                                    bottom: 4,
                                    right: 4,
                                    child: localControls!,
                                  ),
                              ],
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
            ],
          ),
        );
      },
    );
  }
}

class _VideoChrome extends StatefulWidget {
  const _VideoChrome({
    required this.enabled,
    required this.timeout,
    required this.callId,
    required this.builder,
  });
  final bool enabled;
  final Duration timeout;
  final String callId;
  final Widget Function(bool visible) builder;
  @override
  State<_VideoChrome> createState() => _VideoChromeState();
}

class _VideoChromeState extends State<_VideoChrome>
    with WidgetsBindingObserver {
  bool foreground =
      WidgetsBinding.instance.lifecycleState == null ||
      WidgetsBinding.instance.lifecycleState == AppLifecycleState.resumed;
  Timer? timer;
  bool visible = true;
  void arm() {
    timer?.cancel();
    if (widget.enabled && foreground) {
      timer = Timer(
        widget.timeout < const Duration(seconds: 1)
            ? const Duration(seconds: 1)
            : widget.timeout,
        () {
          if (mounted) setState(() => visible = false);
        },
      );
    }
  }

  void reveal() {
    if (!visible) setState(() => visible = true);
    arm();
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    arm();
  }

  @override
  void didUpdateWidget(covariant _VideoChrome oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.enabled != widget.enabled ||
        oldWidget.timeout != widget.timeout ||
        oldWidget.callId != widget.callId) {
      visible = true;
      arm();
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    foreground = state == AppLifecycleState.resumed;
    timer?.cancel();
    if (foreground) reveal();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Listener(
    onPointerDown: (_) => reveal(),
    child: GestureDetector(
      behavior: HitTestBehavior.translucent,
      onTap: reveal,
      child: widget.builder(!widget.enabled || visible),
    ),
  );
}
