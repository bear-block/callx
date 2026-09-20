import Foundation
@preconcurrency import React

@objc(Callx)
final class CallxModule: RCTEventEmitter {
    nonisolated(unsafe) private static var hostRuntime: BridgeRuntime?
    private var eventReceiver: ReactBridgeEventReceiver?
    static func configure(_ runtime: BridgeRuntime) { hostRuntime = runtime }
    static func reset() { hostRuntime = nil }
    override static func requiresMainQueueSetup() -> Bool { false }
    override func supportedEvents() -> [String]! { ["callxEvent"] }

    @objc func setup(_ config: NSDictionary, resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock) {
        if let runtime = Self.hostRuntime {
            let callback = ReactPromiseBox(resolve, reject)
            Task { callback.resolve(bridgeAny(await runtime.setup())) }
            return
        }
        resolve([
            "contractVersion": "0.1.0", "coreVersion": "0.1.0", "execution": "native",
            "accountGeneration": "unconfigured", "nativeCalling": false, "durableReplay": false,
            "providerManagedSignaling": false, "hold": false, "mute": false,
        ])
    }

    @objc func execute(_ value: NSDictionary, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        invoke(value, resolve, reject) { try await $0.execute($1) }
    }
    @objc func queryOperation(_ value: NSDictionary, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        invoke(value, resolve, reject) { try await $0.queryOperation($1) }
    }
    @objc func openSession(_ value: NSDictionary, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        invoke(value, resolve, reject) { try await $0.openSession($1) }
    }
    @objc func acknowledge(_ value: NSDictionary, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        invoke(value, resolve, reject) { runtime, object in try await runtime.acknowledge(object); return [:] }
    }
    @objc func closeSession(_ value: NSDictionary, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        invoke(value, resolve, reject) { runtime, object in try await runtime.closeSession(object); return [:] }
    }
    @objc func getSnapshot(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        guard let runtime = Self.hostRuntime else { reject("notConfigured", "Native Callx host has not been configured.", nil); return }
        let callback = ReactPromiseBox(resolve, reject)
        Task { do { callback.resolve(bridgeAny(try await runtime.getSnapshot())) }
            catch { callback.reject(error) } }
    }
    @objc func dispose() { if let runtime = Self.hostRuntime { Task { await runtime.setEventReceiver(nil) } } }

    override func startObserving() {
        guard let runtime = Self.hostRuntime else { return }
        let receiver = ReactBridgeEventReceiver(self); eventReceiver = receiver
        Task { await runtime.setEventReceiver(receiver) }
    }
    override func stopObserving() {
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
    public static func configure(_ runtime: BridgeRuntime) { CallxModule.configure(runtime) }
    public static func reset() { CallxModule.reset() }
}

private final class ReactBridgeEventReceiver: BridgeEventReceiving, @unchecked Sendable {
    private weak var module: CallxModule?
    init(_ module: CallxModule) { self.module = module }
    func receive(_ event: BridgeObject) {
        let payload = ReactPayloadBox(bridgeAny(event))
        DispatchQueue.main.async { [weak module, payload] in module?.sendEvent(withName: "callxEvent", body: payload.value) }
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
