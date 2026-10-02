import Foundation
@preconcurrency import React

/// The Swift side of the Callx TurboModule. `CallxModule.mm` conforms to the codegen spec
/// (src/specs/NativeCallx.ts) and forwards every method here; events go out through `emit`.
@objc(CallxModuleImpl)
public final class CallxModuleImpl: NSObject {
    nonisolated(unsafe) private static var hostRuntime: BridgeRuntime?
    private var eventReceiver: ReactBridgeEventReceiver?
    /// Set by CallxModule.mm: sends a "callxEvent" to JavaScript.
    @objc public var emit: ((Any) -> Void)?
    static func configure(_ runtime: BridgeRuntime) { hostRuntime = runtime }
    static func reset() { hostRuntime = nil }

    @objc public func setup(_ config: NSDictionary, resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock) {
        if let runtime = Self.hostRuntime {
            let callback = ReactPromiseBox(resolve, reject)
            let object: BridgeObject
            do { object = try bridgeObject(config) } catch { callback.reject(error); return }
            Task { do { callback.resolve(bridgeAny(try await runtime.setup(object))) }
                catch { callback.reject(error) } }
            return
        }
        resolve([
            "contractVersion": "0.2.0", "coreVersion": "0.2.0", "execution": "native",
            "accountGeneration": "unconfigured", "nativeCalling": false, "durableReplay": false,
            "providerManagedSignaling": false, "hold": false, "mute": false, "video": false,
        ])
    }

    @objc public func execute(_ value: NSDictionary, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        invoke(value, resolve, reject) { try await $0.execute($1) }
    }
    @objc public func queryOperation(_ value: NSDictionary, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        invoke(value, resolve, reject) { try await $0.queryOperation($1) }
    }
    @objc public func openSession(_ value: NSDictionary, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        invoke(value, resolve, reject) { try await $0.openSession($1) }
    }
    @objc public func acknowledge(_ value: NSDictionary, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        invoke(value, resolve, reject) { runtime, object in try await runtime.acknowledge(object); return [:] }
    }
    @objc public func closeSession(_ value: NSDictionary, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        invoke(value, resolve, reject) { runtime, object in try await runtime.closeSession(object); return [:] }
    }
    @objc public func getPushToken(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        resolve(CallxPushTokens.current.map { ["type": $0.type, "token": $0.token] })
    }
    @objc public func getSnapshot(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        guard let runtime = Self.hostRuntime else { reject("notConfigured", "Native Callx host has not been configured.", nil); return }
        let callback = ReactPromiseBox(resolve, reject)
        Task { do { callback.resolve(bridgeAny(try await runtime.getSnapshot())) }
            catch { callback.reject(error) } }
    }
    // Event delivery belongs to start/stopObserving; one Callx instance must not stop it for others.
    @objc public func dispose() {}
    /// Picture-in-picture is Android only for now (ADR-0010 addendum).
    @objc public func configurePictureInPicture(_ options: NSDictionary) {}
    @objc public func enterPictureInPicture(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        resolve(false)
    }

    @objc public func startObserving() {
        guard let runtime = Self.hostRuntime else { return }
        let receiver = ReactBridgeEventReceiver(self); eventReceiver = receiver
        Task { await runtime.setEventReceiver(receiver) }
    }
    @objc public func stopObserving() {
        eventReceiver = nil
        if let runtime = Self.hostRuntime { Task { await runtime.setEventReceiver(nil) } }
    }

    private func invoke(_ value: NSDictionary, _ resolve: @escaping RCTPromiseResolveBlock,
        _ reject: @escaping RCTPromiseRejectBlock,
        action: @escaping @Sendable (BridgeRuntime, BridgeObject) async throws -> BridgeObject) {
        guard let runtime = Self.hostRuntime else { reject("notConfigured", "Native Callx host has not been configured.", nil); return }
        let object: BridgeObject
        do { object = try bridgeObject(value) } catch { ReactPromiseBox(resolve, reject).reject(error); return }
        let callback = ReactPromiseBox(resolve, reject)
        Task { do { callback.resolve(bridgeAny(try await action(runtime, object))) }
            catch { callback.reject(error) } }
    }
}

public enum CallxReactNativeHost {
    /** Install once after constructing CallKit plus native signaling/media dependencies. */
    public static func configure(_ runtime: BridgeRuntime) { CallxModuleImpl.configure(runtime) }
    /// Starts the whole native pipeline and installs it for React Native (ADR-0009). Call from
    /// `application(_:didFinishLaunchingWithOptions:)`; see `CallxBootstrap.start` for failures.
    @available(iOS 15.0, *)
    @discardableResult
    public static func bootstrap(_ config: CallxBootstrapConfig = CallxBootstrapConfig()) throws -> CallxBootstrap {
        try CallxBootstrap.start(config) { CallxModuleImpl.configure($0) }
    }
    public static func reset() { CallxModuleImpl.reset() }
}

private final class ReactBridgeEventReceiver: BridgeEventReceiving, @unchecked Sendable {
    private weak var module: CallxModuleImpl?
    init(_ module: CallxModuleImpl) { self.module = module }
    func receive(_ event: BridgeObject) {
        let payload = ReactPayloadBox(bridgeAny(event))
        DispatchQueue.main.async { [weak module, payload] in module?.emit?(payload.value as Any) }
    }
}
private final class ReactPromiseBox: @unchecked Sendable {
    private let resolveBlock: RCTPromiseResolveBlock
    private let rejectBlock: RCTPromiseRejectBlock
    init(_ resolve: @escaping RCTPromiseResolveBlock, _ reject: @escaping RCTPromiseRejectBlock) {
        resolveBlock = resolve; rejectBlock = reject
    }
    func resolve(_ value: Any?) {
        let payload = ReactPayloadBox(value); DispatchQueue.main.async { [self, payload] in resolveBlock(payload.value) }
    }
    func reject(_ error: Error) {
        let bridge = error as? BridgeError
        let code = bridge?.code ?? "internal"; let message = bridge?.message ?? error.localizedDescription
        DispatchQueue.main.async { [self, code, message] in rejectBlock(code, message, error) }
    }
}
private final class ReactPayloadBox: @unchecked Sendable {
    let value: Any?
    init(_ value: Any?) { self.value = value }
}
private func bridgeObject(_ raw: Any?) throws -> BridgeObject {
    guard let map = raw as? [String: Any] else { throw BridgeError("invalidArgument", "Arguments must be an object.") }
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
