@preconcurrency import Flutter
import UIKit

/// Dart configuration only; the adapter itself is created natively by callx's bootstrap, which
/// finds `CallxLiveKitAdapterFactory` in Info.plist `CallxMediaAdapterFactories`.
public final class CallxLiveKitPlugin: NSObject, FlutterPlugin {
    public static func register(with registrar: FlutterPluginRegistrar) {
        let channel = FlutterMethodChannel(name: "dev.callx.livekit", binaryMessenger: registrar.messenger())
        registrar.addMethodCallDelegate(CallxLiveKitPlugin(), channel: channel)
    }

    public func handle(_ call: FlutterMethodCall, result: @escaping FlutterResult) {
        let arguments = call.arguments as? [String: Any] ?? [:]
        switch call.method {
        case "configure":
            guard let text = arguments["tokenUrl"] as? String, let url = URL(string: text) else {
                result(FlutterError(code: "invalidArgument", message: "tokenUrl is not a URL.", details: nil)); return
            }
            do {
                try CallxLiveKit.configure(tokenURL: url, headers: arguments["headers"] as? [String: String] ?? [:])
                result(nil)
            } catch { result(FlutterError(code: "invalidArgument", message: "\(error)", details: nil)) }
        case "reset": CallxLiveKit.reset(); result(nil)
        default: result(FlutterMethodNotImplemented)
        }
    }
}
