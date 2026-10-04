import Foundation
import Testing
@testable import CallxCore

@Test func canonicalContractFixtures() throws {
    var root = URL(fileURLWithPath: #filePath)
    for _ in 0..<5 { root.deleteLastPathComponent() }
    let manifestData = try Data(contentsOf: root.appending(path: "contracts/v0/manifest.json"))
    let fixtureData = try Data(contentsOf: root.appending(path: "contracts/v0/fixtures.json"))
    let manifestJSON = try #require(JSONSerialization.jsonObject(with: manifestData) as? [String: Any])
    let fixtureJSON = try #require(JSONSerialization.jsonObject(with: fixtureData) as? [String: Any])
    let validator = ContractValidator(manifest: try ContractManifest(json: manifestJSON))
    let valid = try #require(fixtureJSON["valid"] as? [[String: Any]])
    let invalid = try #require(fixtureJSON["invalid"] as? [[String: Any]])
    for fixture in valid { try validator.validateFixture(fixture) }
    for fixture in invalid {
        let path = try #require(fixture["path"] as? String)
        let value = fixture["value"] as Any
        #expect(throws: ContractViolation.self) {
            if path == "event.sequence" {
                try validator.validateFixture(["event": ["contractVersion": "0.3.0", "eventId": "invalid-event",
                    "sequence": value, "kind": "callChanged", "source": "local", "observedAtMs": 0]])
            } else if path == "command.operationId" {
                try validator.validateFixture(["command": ["contractVersion": "0.3.0", "operationId": value,
                    "type": "answer", "callId": "call-1"]])
            } else {
                try validator.validateFixture([path: value])
            }
        }
    }
}
