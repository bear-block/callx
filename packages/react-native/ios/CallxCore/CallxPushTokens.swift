import Foundation

/// The device's push token for Callx invitations; Dart and JavaScript read it to register with
/// the backend.
public struct CallxPushToken: Sendable, Equatable {
    /// `voip` (APNs PushKit) on iOS, `fcm` on Android.
    public let type: String
    public let token: String
    public init(type: String, token: String) { self.type = type; self.token = token }
}

/// The latest push token of this process. `CallxBootstrap` records the PushKit token here.
public enum CallxPushTokens {
    private static let lock = NSLock()
    nonisolated(unsafe) private static var value: CallxPushToken?
    public static var current: CallxPushToken? { lock.withLock { value } }
    public static func updateVoIP(_ token: Data) {
        let hex = token.map { String(format: "%02x", $0) }.joined()
        lock.withLock { value = CallxPushToken(type: "voip", token: hex) }
    }
    public static func clear() { lock.withLock { value = nil } }
}
