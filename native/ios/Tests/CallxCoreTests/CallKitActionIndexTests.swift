import Foundation
import Testing
@testable import CallxCore

@Test func actionIndexCompletesSystemActionsWithoutAnOperationID() {
    let index = CallKitActionIndex()
    let actionID = UUID()
    #expect(index.begin(actionUUID: actionID))
    #expect(!index.begin(actionUUID: actionID))
    let completion = index.complete(actionUUID: actionID)
    #expect(completion != nil)
    #expect(completion?.operationID == nil)
    #expect(index.complete(actionUUID: actionID) == nil)
}

@Test func actionIndexPreservesCorrelationAndTimeoutDefeatsLateCompletion() {
    let index = CallKitActionIndex()
    let actionID = UUID()
    index.register(actionUUID: actionID, operationID: "answer-1")
    #expect(index.begin(actionUUID: actionID))
    #expect(index.remove(actionUUID: actionID) == "answer-1")
    #expect(index.complete(actionUUID: actionID) == nil)
}

@Test func actionIndexResetDrainsSubmittedAndSystemActions() {
    let index = CallKitActionIndex()
    let submitted = UUID(), system = UUID()
    index.register(actionUUID: submitted, operationID: "pending-before-waiter")
    #expect(index.begin(actionUUID: system))
    #expect(index.reset() == ["pending-before-waiter"])
    #expect(index.complete(actionUUID: submitted) == nil)
    #expect(index.complete(actionUUID: system) == nil)
    #expect(index.reset().isEmpty)
}
