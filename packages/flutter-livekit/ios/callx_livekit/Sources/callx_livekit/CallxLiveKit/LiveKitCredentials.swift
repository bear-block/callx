import Foundation
import Security

/// Where and as whom a call's media connects.
public struct LiveKitCredentials: Sendable, Equatable {
    public let url: String
    public let token: String
    public init(url: String, token: String) { self.url = url; self.token = token }
}

public enum LiveKitCredentialError: Error, CustomStringConvertible {
    case notConfigured
    case endpoint(String)
    public var description: String {
        switch self {
        case .notConfigured: "LiveKit adapter is not configured: call configure(tokenUrl:) after sign-in."
        case .endpoint(let reason): reason
        }
    }
}

/// The backend contract of the HTTP credential source: `POST tokenUrl` with the configured headers
/// and `{"callId": "..."}`; the backend authenticates the user, checks call membership and answers
/// `{"url": "wss://...", "token": "..."}`.
public enum LiveKitTokenEndpoint {
    public static func requestBody(callID: String) -> Data {
        (try? JSONSerialization.data(withJSONObject: ["callId": callID])) ?? Data()
    }

    public static func parse(status: Int, body: Data) throws -> LiveKitCredentials {
        guard (200..<300).contains(status) else { throw LiveKitCredentialError.endpoint("Token endpoint answered \(status).") }
        guard let json = try? JSONSerialization.jsonObject(with: body) as? [String: Any] else {
            throw LiveKitCredentialError.endpoint("Token endpoint answered invalid JSON.")
        }
        guard let url = json["url"] as? String, !url.isEmpty, let token = json["token"] as? String, !token.isEmpty else {
            throw LiveKitCredentialError.endpoint("Token endpoint answer lacks url or token.")
        }
        return LiveKitCredentials(url: url, token: token)
    }

    public static func fetch(tokenURL: URL, headers: [String: String], callID: String) async throws -> LiveKitCredentials {
        var request = URLRequest(url: tokenURL, timeoutInterval: 5)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "content-type")
        for (name, value) in headers { request.setValue(value, forHTTPHeaderField: name) }
        request.httpBody = requestBody(callID: callID)
        let (data, response) = try await URLSession.shared.data(for: request)
        return try parse(status: (response as? HTTPURLResponse)?.statusCode ?? 0, body: data)
    }
}

/// The persisted HTTP credential source. The URL lives in user defaults; headers, which usually
/// carry a session token, live in the keychain with after-first-unlock access, so a call
/// answered on the lock screen can still read them.
struct LiveKitConfigStore: Sendable {
    private let service: String
    init(service: String = "dev.callx.livekit") { self.service = service }
    private var urlKey: String { "\(service).tokenUrl" }

    func save(tokenURL: URL, headers: [String: String]) throws {
        let data = try JSONSerialization.data(withJSONObject: headers)
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service, kSecAttrAccount as String: "headers"]
        SecItemDelete(query as CFDictionary)
        var item = query
        item[kSecValueData as String] = data
        item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let status = SecItemAdd(item as CFDictionary, nil)
        guard status == errSecSuccess else { throw LiveKitCredentialError.endpoint("Keychain refused the headers (\(status)).") }
        UserDefaults.standard.set(tokenURL.absoluteString, forKey: urlKey)
    }

    func load() -> (URL, [String: String])? {
        guard let text = UserDefaults.standard.string(forKey: urlKey), let url = URL(string: text) else { return nil }
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service, kSecAttrAccount as String: "headers",
            kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne]
        var result: AnyObject?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess, let data = result as? Data,
              let headers = try? JSONSerialization.jsonObject(with: data) as? [String: String] else { return (url, [:]) }
        return (url, headers)
    }

    func clear() {
        UserDefaults.standard.removeObject(forKey: urlKey)
        SecItemDelete([kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service] as CFDictionary)
    }
}
