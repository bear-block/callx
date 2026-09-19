import Flutter
import UIKit

public final class CallxPlugin: NSObject, FlutterPlugin, FlutterStreamHandler {
    public static func register(with registrar: FlutterPluginRegistrar) {
        let instance = CallxPlugin()
        registrar.addMethodCallDelegate(instance, channel: FlutterMethodChannel(
            name: "dev.callx/methods", binaryMessenger: registrar.messenger()))
        FlutterEventChannel(name: "dev.callx/events", binaryMessenger: registrar.messenger())
            .setStreamHandler(instance)
    }

    public func handle(_ call: FlutterMethodCall, result: @escaping FlutterResult) {
        switch call.method {
        case "setup": result([
            "contractVersion": "0.1.0", "coreVersion": "0.1.0", "execution": "native",
            "accountGeneration": "unconfigured", "nativeCalling": false, "durableReplay": false,
            "providerManagedSignaling": false, "hold": false, "mute": false,
        ])
        case "dispose": result(nil)
        default: result(FlutterError(code: "notConfigured",
            message: "Native Callx host has not been configured.", details: nil))
        }
    }

    public func onListen(withArguments arguments: Any?, eventSink events: @escaping FlutterEventSink) -> FlutterError? { nil }
    public func onCancel(withArguments arguments: Any?) -> FlutterError? { nil }
}
