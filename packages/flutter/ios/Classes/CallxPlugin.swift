@preconcurrency import Flutter
import UIKit

public final class CallxPlugin: NSObject, FlutterPlugin, FlutterStreamHandler {
    nonisolated(unsafe) private static var hostRuntime: BridgeRuntime?
    private var receiver: FlutterBridgeEventReceiver?

    public static func configure(_ runtime: BridgeRuntime) { hostRuntime = runtime }
    public static func reset() { hostRuntime = nil }
    public static func register(with registrar: FlutterPluginRegistrar) {
        let instance = CallxPlugin()
        registrar.addMethodCallDelegate(instance, channel: FlutterMethodChannel(
            name: "dev.callx/methods", binaryMessenger: registrar.messenger()))
        FlutterEventChannel(name: "dev.callx/events", binaryMessenger: registrar.messenger())
            .setStreamHandler(instance)
    }

    public func handle(_ call: FlutterMethodCall, result: @escaping FlutterResult) {
        let runtime = Self.hostRuntime
        switch call.method {
        case "setup" where runtime == nil: result([
            "contractVersion": "0.1.0", "coreVersion": "0.1.0", "execution": "native",
            "accountGeneration": "unconfigured", "nativeCalling": false, "durableReplay": false,
            "providerManagedSignaling": false, "hold": false, "mute": false,
        ])
        case "dispose": result(nil)
        default:
            guard let runtime else { result(FlutterError(code: "notConfigured",
                message: "Native Callx host has not been configured.", details: nil)); return }
            let arguments: BridgeObject
            do { arguments = try bridgeObject(call.arguments) }
            catch let error as BridgeError { result(FlutterError(code: error.code, message: error.message, details: nil)); return }
            catch { result(FlutterError(code: "internal", message: error.localizedDescription, details: nil)); return }
            let method = call.method
            let callback = FlutterResultBox(result)
            Task {
                do {
                    let value: Any
                    switch method {
                    case "setup": value = bridgeAny(await runtime.setup())
                    case "execute": value = bridgeAny(try await runtime.execute(arguments))
                    case "queryOperation": value = bridgeAny(try await runtime.queryOperation(arguments))
                    case "openSession": value = bridgeAny(try await runtime.openSession(arguments))
                    case "acknowledge": try await runtime.acknowledge(arguments); value = NSNull()
                    case "closeSession": try await runtime.closeSession(arguments); value = NSNull()
                    case "getSnapshot": value = bridgeAny(try await runtime.getSnapshot())
                    default: callback.complete(FlutterMethodNotImplemented); return
                    }
                    callback.complete(value)
                } catch let error as BridgeError {
                    callback.complete(FlutterError(code: error.code, message: error.message, details: nil))
                } catch {
                    callback.complete(FlutterError(code: "internal", message: error.localizedDescription, details: nil))
                }
            }
        }
    }

    public func onListen(withArguments arguments: Any?, eventSink events: @escaping FlutterEventSink) -> FlutterError? {
        let receiver = FlutterBridgeEventReceiver(events); self.receiver = receiver
        if let runtime = Self.hostRuntime { Task { await runtime.setEventReceiver(receiver) } }
        return nil
    }
    public func onCancel(withArguments arguments: Any?) -> FlutterError? {
        receiver = nil; if let runtime = Self.hostRuntime { Task { await runtime.setEventReceiver(nil) } }; return nil
    }
}

private final class FlutterBridgeEventReceiver: BridgeEventReceiving, @unchecked Sendable {
    private let sink: FlutterEventSink
    init(_ sink: @escaping FlutterEventSink) { self.sink = sink }
    func receive(_ event: BridgeObject) { DispatchQueue.main.async { [sink] in sink(bridgeAny(event)) } }
}
private final class FlutterResultBox: @unchecked Sendable {
    private let result: FlutterResult
    init(_ result: @escaping FlutterResult) { self.result = result }
    func complete(_ value: Any?) {
        let payload = FlutterPayloadBox(value)
        DispatchQueue.main.async { [self, payload] in result(payload.value) }
    }
}
private final class FlutterPayloadBox: @unchecked Sendable {
    let value: Any?
    init(_ value: Any?) { self.value = value }
}

private func bridgeObject(_ raw: Any?) throws -> BridgeObject {
    guard let map = raw as? [String: Any] else {
        if raw == nil { return [:] }; throw BridgeError("invalidArgument", "Arguments must be an object.")
    }
    return try map.mapValues(bridgeValue)
}
private func bridgeValue(_ raw: Any) throws -> BridgeValue {
    if raw is NSNull { return .null }
    if let value = raw as? Bool { return .bool(value) }
    if let value = raw as? Int { return .integer(Int64(value)) }
    if let value = raw as? Int64 { return .integer(value) }
    if let value = raw as? NSNumber { return .integer(value.int64Value) }
    if let value = raw as? String { return .string(value) }
    if let value = raw as? [Any] { return .array(try value.map(bridgeValue)) }
    if let value = raw as? [String: Any] { return .object(try value.mapValues(bridgeValue)) }
    throw BridgeError("invalidArgument", "Unsupported bridge value.")
}
private func bridgeAny(_ value: BridgeValue) -> Any {
    switch value {
    case .string(let value): value
    case .bool(let value): value
    case .integer(let value): value
    case .object(let value): bridgeAny(value)
    case .array(let value): value.map(bridgeAny)
    case .null: NSNull()
    }
}
private func bridgeAny(_ value: BridgeObject) -> [String: Any] { value.mapValues(bridgeAny) }
