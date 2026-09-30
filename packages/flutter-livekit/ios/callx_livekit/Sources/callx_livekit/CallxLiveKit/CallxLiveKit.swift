#if os(iOS)
import Foundation
#if canImport(callx)
import callx
#elseif canImport(callx_react_native)
import callx_react_native
#else
import CallxCore
#endif

/// Configuration of the LiveKit adapter. Configure once, for example after sign-in; the
/// configuration persists, so a call answered while the app was killed still gets credentials.
public enum CallxLiveKit {
    nonisolated(unsafe) private static var provider: (@Sendable (String) async throws -> LiveKitCredentials)?
    static let store = LiveKitConfigStore()

    /// HTTP credential source (see `LiveKitTokenEndpoint`); persisted, headers in the keychain.
    public static func configure(tokenURL: URL, headers: [String: String] = [:]) throws {
        guard ["https", "http"].contains(tokenURL.scheme ?? "") else {
            throw LiveKitCredentialError.endpoint("tokenUrl must be an http(s) URL.")
        }
        try store.save(tokenURL: tokenURL, headers: headers)
    }

    /// Native credential source for hosts that already hold credentials natively. Set it before
    /// bootstrap; it takes precedence over `configure`. Not persisted.
    public static func setCredentialProvider(_ provider: (@Sendable (String) async throws -> LiveKitCredentials)?) {
        self.provider = provider
    }

    /// Forget the persisted source, for example on sign-out.
    public static func reset() { store.clear() }

    static func credentials(callID: String) async throws -> LiveKitCredentials {
        if let provider { return try await provider(callID) }
        guard let (url, headers) = store.load() else { throw LiveKitCredentialError.notConfigured }
        return try await LiveKitTokenEndpoint.fetch(tokenURL: url, headers: headers, callID: callID)
    }
}

/// Listed in Info.plist `CallxMediaAdapterFactories` by this package's setup; Callx's bootstrap
/// creates it (ADR-0009).
@objc(CallxLiveKitAdapterFactory)
public final class LiveKitAdapterFactory: NSObject, CallxMediaAdapterFactory {
    public override init() {}
    public func makeAdapter(context: CallxAdapterContext) throws -> any CallxMediaAdapter {
        LiveKitMediaAdapter(credentials: { try await CallxLiveKit.credentials(callID: $0) }, log: context.log)
    }
}
#endif
