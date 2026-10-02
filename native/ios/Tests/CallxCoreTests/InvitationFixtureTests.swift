import Foundation
import Testing
@testable import CallxCore

private func invitationFixtures() throws -> [String: Any] {
    var root = URL(fileURLWithPath: #filePath)
    for _ in 0..<5 { root.deleteLastPathComponent() }
    let data = try Data(contentsOf: root.appending(path: "contracts/invitation-v1/fixtures.json"))
    return try #require(JSONSerialization.jsonObject(with: data) as? [String: Any])
}

@Test func validInvitationFixturesDecodeToTheExpectedInvitation() throws {
    for fixture in try #require(try invitationFixtures()["valid"] as? [[String: Any]]) {
        let expected = try #require(fixture["expected"] as? [String: Any])
        let wanted = Invitation(callID: expected["callId"] as! String, displayName: expected["displayName"] as! String,
            handle: expected["handle"] as! String, eventID: expected["eventId"] as? String,
            revision: expected["revision"] as? String, issuedAtMs: (expected["issuedAtMs"] as? NSNumber)?.int64Value,
            expiresAtMs: (expected["expiresAtMs"] as? NSNumber)?.int64Value,
            video: (expected["video"] as? Bool) ?? false)
        // APNs delivers the invitation as a nested object under "callx".
        let payload: [AnyHashable: Any] = ["aps": [String: Any](), "callx": fixture["payload"]!]
        #expect(try InvitationCodec.decode(pushPayload: payload) == wanted, "\(fixture["name"]!)")
        // A backend may also send the object as JSON text, as FCM requires.
        let text = String(decoding: try JSONSerialization.data(withJSONObject: fixture["payload"]!), as: UTF8.self)
        #expect(try InvitationCodec.decode(pushPayload: ["callx": text]) == wanted)
    }
}

@Test func invalidInvitationFixturesAreRejected() throws {
    for fixture in try #require(try invitationFixtures()["invalid"] as? [[String: Any]]) {
        let data = try JSONSerialization.data(withJSONObject: fixture["payload"]!)
        #expect(throws: InvitationViolation.self, "\(fixture["name"]!)") { try InvitationCodec.decode(json: data) }
    }
    #expect(throws: InvitationViolation.self) { try InvitationCodec.decode(json: Data("not json".utf8)) }
    #expect(throws: InvitationViolation.self) { try InvitationCodec.decode(json: Data("[]".utf8)) }
}

@Test func pushesWithoutTheCallxKeyBelongToTheHost() throws {
    #expect(try InvitationCodec.decode(pushPayload: ["aps": [String: Any]()]) == nil)
}
