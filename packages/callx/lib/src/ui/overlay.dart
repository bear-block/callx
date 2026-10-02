import 'package:flutter/material.dart';
import 'call_screen.dart';

/// Mount above navigation. Collapsing the call preserves the mounted home/navigation tree.
class CallxCallOverlay extends StatelessWidget {
  const CallxCallOverlay({
    super.key,
    required this.child,
    this.expanded,
    this.minimized,
    this.systemPictureInPicture,
    required this.onMinimize,
  });
  final Widget child;
  final Widget? expanded;
  final Widget? minimized;
  final Widget? systemPictureInPicture;
  final VoidCallback onMinimize;
  @override
  Widget build(BuildContext context) => PopScope(
    canPop: expanded == null,
    onPopInvokedWithResult: (didPop, _) {
      if (!didPop && expanded != null) onMinimize();
    },
    child: Stack(
      children: [
        Positioned.fill(
          child: IgnorePointer(
            ignoring: expanded != null || systemPictureInPicture != null,
            child: ExcludeSemantics(
              excluding: expanded != null || systemPictureInPicture != null,
              child: child,
            ),
          ),
        ),
        if (systemPictureInPicture != null)
          Positioned.fill(child: systemPictureInPicture!)
        else if (expanded != null)
          Positioned.fill(child: expanded!),
        if (expanded == null &&
            systemPictureInPicture == null &&
            minimized != null)
          Positioned(right: 16, bottom: 16, child: SafeArea(child: minimized!)),
      ],
    ),
  );
}

/// A mini-call inside the app. It never changes Activity mode or native call state.
class CallxMiniCall extends StatelessWidget {
  const CallxMiniCall({
    super.key,
    required this.displayName,
    required this.onExpand,
    required this.onEnd,
    this.preview,
    this.brand = const CallxCallBrand(),
  });
  final String displayName;
  final VoidCallback onExpand;
  final VoidCallback onEnd;
  final Widget? preview;
  final CallxCallBrand brand;
  @override
  Widget build(BuildContext context) => Material(
    color: brand.backgroundColor,
    borderRadius: BorderRadius.circular(18),
    clipBehavior: Clip.antiAlias,
    elevation: 8,
    child: SizedBox(
      width: 144,
      height: 220,
      child: Column(
        children: [
          Expanded(
            child: Semantics(
              label: 'Return to call',
              button: true,
              onTap: onExpand,
              child: ExcludeSemantics(
                child: InkWell(
                  onTap: onExpand,
                  child: Stack(
                    children: [
                      Positioned.fill(child: CallxCallBackdrop(brand: brand)),
                      if (preview != null)
                        Positioned.fill(child: IgnorePointer(child: preview!)),
                      Positioned(
                        bottom: 0,
                        left: 0,
                        right: 0,
                        child: ColoredBox(
                          color: Colors.black54,
                          child: Padding(
                            padding: const EdgeInsets.all(8),
                            child: Text(
                              displayName,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(color: Colors.white),
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
          SizedBox(
            width: double.infinity,
            child: TextButton(
              style: TextButton.styleFrom(
                backgroundColor: const Color(0xffb53936),
                foregroundColor: Colors.white,
              ),
              onPressed: onEnd,
              child: const Text('End call'),
            ),
          ),
        ],
      ),
    ),
  );
}
