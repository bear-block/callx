import Foundation

/// A `call.invited` event (schema v1 of the signaling recipe) after validation.
public struct Invitation: Equatable, Sendable {
    public let callID: String
    public let displayName: String
    public let handle: String
    public let eventID: String?
    public let revision: String?
    public let issuedAtMs: Int64?
    public let expiresAtMs: Int64?
    /// Report the call to the OS as a video call (ADR-0010).
    public let video: Bool
    public init(callID: String, displayName: String, handle: String, eventID: String? = nil,
        revision: String? = nil, issuedAtMs: Int64? = nil, expiresAtMs: Int64? = nil, video: Bool = false) {
        self.callID = callID; self.displayName = displayName; self.handle = handle; self.eventID = eventID
        self.revision = revision; self.issuedAtMs = issuedAtMs; self.expiresAtMs = expiresAtMs; self.video = video
    }
}

public struct InvitationViolation: Error, Equatable, Sendable {
    public let message: String
    public init(_ message: String) { self.message = message }
}

public enum InvitationCodec {
    /// The APNs payload key, or FCM data key, that carries the invitation.
    public static let payloadKey = "callx"
    private static let maxSafe: Int64 = 9_007_199_254_740_991
    private static let identifier = try! NSRegularExpression(pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")
    private static let decimal = try! NSRegularExpression(pattern: "^(0|[1-9][0-9]{0,19})$")

    /// Returns nil when the push carries no Callx invitation. The value may be an object or a JSON string.
    public static func decode(pushPayload: [AnyHashable: Any]) throws -> Invitation? {
        guard let raw = pushPayload[payloadKey] else { return nil }
        if let text = raw as? String { return try decode(json: Data(text.utf8)) }
        guard JSONSerialization.isValidJSONObject(raw) else { throw InvitationViolation("payload must be an object") }
        return try decode(json: JSONSerialization.data(withJSONObject: raw))
    }

    public static func decode(json: Data) throws -> Invitation {
        guard let payload = (try? JSONSerialization.jsonObject(with: json)) as? [String: Any] else {
            throw InvitationViolation("payload must be an object")
        }
        guard try integer(payload, "schemaVersion") == 1 else { throw InvitationViolation("schemaVersion must be 1") }
        guard try text(payload, "type") == "call.invited" else { throw InvitationViolation("type must be call.invited") }
        guard let callID = try id(payload, "callId") else { throw InvitationViolation("callId is required") }
        guard let displayName = try bounded(payload, "displayName") else { throw InvitationViolation("displayName is required") }
        guard let handle = try bounded(payload, "handle") else { throw InvitationViolation("handle is required") }
        let revision = try text(payload, "revision")
        if let revision, !matches(decimal, revision) { throw InvitationViolation("revision is invalid") }
        return Invitation(callID: callID, displayName: displayName, handle: handle, eventID: try id(payload, "eventId"),
            revision: revision, issuedAtMs: try timestamp(payload, "issuedAtMs"),
            expiresAtMs: try timestamp(payload, "expiresAtMs"), video: try flag(payload, "video"))
    }

    private static func text(_ payload: [String: Any], _ key: String) throws -> String? {
        guard let value = payload[key] else { return nil }
        guard let text = value as? String else { throw InvitationViolation("\(key) must be a string") }
        return text
    }
    private static func id(_ payload: [String: Any], _ key: String) throws -> String? {
        guard let value = try text(payload, key) else { return nil }
        guard matches(identifier, value), value.utf8.count <= 128 else { throw InvitationViolation("\(key) is invalid") }
        return value
    }
    private static func bounded(_ payload: [String: Any], _ key: String) throws -> String? {
        guard let value = try text(payload, key) else { return nil }
        guard !value.isEmpty, value.utf8.count <= 256 else { throw InvitationViolation("\(key) is invalid") }
        return value
    }
    private static func integer(_ payload: [String: Any], _ key: String) throws -> Int64? {
        guard let value = payload[key] else { return nil }
        // JSONSerialization returns booleans and fractions as NSNumber too; accept only whole numbers.
        guard let number = value as? NSNumber, CFGetTypeID(number) != CFBooleanGetTypeID(),
              let exact = Int64(exactly: number.doubleValue), number.stringValue == String(exact) else {
            throw InvitationViolation("\(key) must be an integer")
        }
        return exact
    }
    private static func timestamp(_ payload: [String: Any], _ key: String) throws -> Int64? {
        guard let value = try integer(payload, key) else { return nil }
        guard value >= 0, value <= maxSafe else { throw InvitationViolation("\(key) is out of range") }
        return value
    }
    private static func flag(_ payload: [String: Any], _ key: String) throws -> Bool {
        guard let value = payload[key] else { return false }
        guard let number = value as? NSNumber, CFGetTypeID(number) == CFBooleanGetTypeID() else {
            throw InvitationViolation("\(key) must be a boolean")
        }
        return number.boolValue
    }
    private static func matches(_ expression: NSRegularExpression, _ text: String) -> Bool {
        let range = NSRange(text.startIndex..<text.endIndex, in: text)
        return expression.firstMatch(in: text, range: range)?.range == range
    }
}
