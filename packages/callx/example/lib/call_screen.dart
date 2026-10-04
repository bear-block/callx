import 'dart:math' as math;
import 'package:callx/callx_ui.dart';
import 'package:flutter/material.dart';

class CallBrand extends CallxCallBrand {
  const CallBrand({
    super.backgroundColor = const Color(0xff102b24),
    super.accentColor = const Color(0xffa7f3d0),
    super.surfaceColor = const Color(0x99102b24),
    super.logo = const CallxLogo(),
  });
}

class CallBackdrop extends CallxCallBackdrop {
  const CallBackdrop({super.key, super.brand = const CallBrand()});
}

class CallScreen extends CallxCallScreen {
  const CallScreen({
    super.key,
    required super.call,
    required super.controls,
    required super.onBack,
    required super.nativeVideo,
    super.elapsed,
    super.localControls,
    super.leadingControls,
    super.error,
    super.endControl,
    super.controlsPinned,
    super.brand = const CallBrand(),
  });
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
