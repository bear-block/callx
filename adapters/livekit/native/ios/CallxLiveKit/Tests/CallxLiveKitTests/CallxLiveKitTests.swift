#if os(iOS)
import CallxCore
import Foundation
import Testing
@testable import CallxLiveKit

@Test func theRequestCarriesTheCallID() throws {
    let body = try JSONSerialization.jsonObject(with: LiveKitTokenEndpoint.requestBody(callID: "call-1")) as? [String: String]
    #expect(body == ["callId": "call-1"])
}

@Test func aSuccessfulAnswerGivesTheRoomCredentials() throws {
    let body = Data(#"{"url":"wss://media.example.com","token":"jwt","ttl":60}"#.utf8)
    #expect(try LiveKitTokenEndpoint.parse(status: 200, body: body) == LiveKitCredentials(url: "wss://media.example.com", token: "jwt"))
}

@Test func failuresSayWhatWentWrong() {
    #expect(throws: LiveKitCredentialError.self) { try LiveKitTokenEndpoint.parse(status: 401, body: Data()) }
    #expect(throws: LiveKitCredentialError.self) { try LiveKitTokenEndpoint.parse(status: 200, body: Data("<html>".utf8)) }
    #expect(throws: LiveKitCredentialError.self) { try LiveKitTokenEndpoint.parse(status: 200, body: Data(#"{"url":"wss://x"}"#.utf8)) }
}

@Test func theConfigurationPersistsWithHeadersInTheKeychain() throws {
    let store = LiveKitConfigStore(service: "dev.callx.livekit.tests")
    defer { store.clear() }
    // A test bundle without a host app has no keychain entitlement (errSecMissingEntitlement);
    // the example apps exercise the keychain on devices.
    do { try store.save(tokenURL: URL(string: "https://probe.invalid")!, headers: [:]) } catch {
        withKnownIssue("No keychain entitlement without a host app") { throw error }; return
    }
    try store.save(tokenURL: URL(string: "https://api.example.com/livekit-token")!, headers: ["authorization": "Bearer abc"])
    let loaded = try #require(store.load())
    #expect(loaded.0.absoluteString == "https://api.example.com/livekit-token")
    #expect(loaded.1 == ["authorization": "Bearer abc"])
    store.clear()
    #expect(store.load() == nil)
}

@Test func theCoreDiscoversTheFactoryByItsObjectiveCName() {
    let resolution = CallxMediaAdapters.resolve(names: ["CallxLiveKitAdapterFactory"], context: CallxAdapterContext(log: { _ in })) {
        NSClassFromString($0) as? any CallxMediaAdapterFactory.Type
    }
    guard case .resolved(let adapter, _) = resolution else { Issue.record("expected the LiveKit adapter"); return }
    #expect(adapter is LiveKitMediaAdapter)
}
#endif
