import 'package:flutter/foundation.dart';
import '../../callx.dart';

enum CallPresentation { hidden, expanded, minimized }

/// Owns display state only. Call lifecycle remains native-owned.
class CallxPresentationController extends ChangeNotifier {
  CallPresentation _mode = CallPresentation.hidden;
  CallPresentation get mode => _mode;
  String? _callId;
  bool _presentable = false;
  bool _presented = false;
  void _set(CallPresentation value) {
    if (_mode != value) {
      _mode = value;
      notifyListeners();
    }
  }

  void update(Call? call) {
    if (call?.callId != _callId) {
      _callId = call?.callId;
      _presented = false;
    }
    _presentable =
        call != null &&
        call.state != CallState.incoming &&
        call.state != CallState.ended;
    if (!_presentable) {
      _set(CallPresentation.hidden);
    } else if (!_presented) {
      _presented = true;
      _set(CallPresentation.expanded);
    }
  }

  void minimize() {
    if (_presentable) _set(CallPresentation.minimized);
  }

  void expand() {
    if (_presentable) _set(CallPresentation.expanded);
  }
}
