import Foundation
import Testing
@testable import CallxCore

@Test func reportPolicyRingsOnlyForAcceptedInvitations() {
    #expect(IncomingReportPolicy.decide(.accepted, mustReport: false) == .ring)
    #expect(IncomingReportPolicy.decide(.accepted, mustReport: true) == .ring)
    for outcome: IncomingOutcome? in [nil, .duplicate, .ended(reason: "declined"), .busy, .expired] {
        #expect(IncomingReportPolicy.decide(outcome, mustReport: false) == .skip)
    }
    #expect(IncomingReportPolicy.decide(.duplicate, mustReport: true) == .reportExisting)
    #expect(IncomingReportPolicy.decide(nil, mustReport: true) == .reportEnded(reason: "failed"))
    #expect(IncomingReportPolicy.decide(.ended(reason: "callerCancelled"), mustReport: true) == .reportEnded(reason: "callerCancelled"))
    #expect(IncomingReportPolicy.decide(.busy, mustReport: true) == .reportEnded(reason: "busy"))
    #expect(IncomingReportPolicy.decide(.expired, mustReport: true) == .reportEnded(reason: "unanswered"))
    #expect(IncomingReportPolicy.tombstoneReason(.busy) == "busy")
    #expect(IncomingReportPolicy.tombstoneReason(.expired) == "unanswered")
    #expect(IncomingReportPolicy.tombstoneReason(.duplicate) == nil)
}

@Test func uuidMapIsStableAndReversible() {
    let map = CallUUIDMap()
    let uuidID = "85a4fd88-b5c3-4f79-a2cf-a7db9df06750"
    #expect(map.uuid(for: uuidID) == UUID(uuidString: uuidID))
    #expect(map.callID(for: UUID(uuidString: uuidID)!) == uuidID)
    let named = map.uuid(for: "call-1")
    #expect(named == CallUUIDMap().uuid(for: "call-1"))
    #expect(named != map.uuid(for: "call-2"))
    #expect(map.callID(for: named) == "call-1")
    #expect(named.uuidString.dropFirst(14).first == "5")
    #expect(CallUUIDMap().callID(for: UUID()) == nil)
}
