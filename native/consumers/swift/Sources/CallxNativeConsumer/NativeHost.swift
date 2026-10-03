import CallxCore

// This target imports the public product, never @testable or framework wrapper modules.
public func capabilities() -> BridgeCapabilities {
    BridgeCapabilities(accountGeneration: "native-consumer", durableReplay: true,
        providerManagedSignaling: false, hold: true, mute: false)
}

#if os(iOS)
/// Compile-only integration fixture; an application calls this from its native entry point.
public func startNativeHost() async throws -> CallxBootstrap {
    var config = CallxBootstrapConfig()
    config.discoverMedia = false
    config.startPushRegistry = false
    let pipeline = try CallxBootstrap.start(config, install: { _ in })
    _ = try await pipeline.ready.value
    let _ = try await pipeline.runtime.setup(["contractVersion": .string("0.2.0")])
    return pipeline
}
#endif
