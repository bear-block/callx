#if os(iOS)
import CallKit
import Foundation
import Testing
@testable import CallxCore

// An unsubmitted CXAction is not owned by a provider, so its isComplete state is
// not the assertion boundary. Record calls to the platform completion API instead.
private final class RecordingAnswerAction: CXAnswerCallAction, @unchecked Sendable {
    private(set) var fulfillCount = 0
    private(set) var failCount = 0
    override func fulfill() { fulfillCount += 1 }
    override func fail() { failCount += 1 }
}

@Test func systemActionIsFulfilledWithoutAnSDKOperation() {
    let lifecycle = CallKitActionLifecycle(index: CallKitActionIndex(),
        registry: PlatformActionRegistry(), nowMs: { 100 })
    let action = RecordingAnswerAction(call: UUID())
    #expect(lifecycle.begin(action))
    lifecycle.applied(action)
    #expect(action.fulfillCount == 1)
    #expect(action.failCount == 0)
    lifecycle.applied(action)
    #expect(action.fulfillCount == 1)
}

@Test func systemActionIsFailedWithoutAnSDKOperation() {
    let lifecycle = CallKitActionLifecycle(index: CallKitActionIndex(),
        registry: PlatformActionRegistry(), nowMs: { 100 })
    let action = RecordingAnswerAction(call: UUID())
    #expect(lifecycle.begin(action))
    lifecycle.rejected(action)
    #expect(action.failCount == 1)
    #expect(action.fulfillCount == 0)
}

@Test func latePerformerCompletionDoesNotFulfillAfterReset() {
    let lifecycle = CallKitActionLifecycle(index: CallKitActionIndex(),
        registry: PlatformActionRegistry(), nowMs: { 100 })
    let action = RecordingAnswerAction(call: UUID())
    #expect(lifecycle.begin(action))
    lifecycle.providerReset()
    lifecycle.applied(action)
    #expect(action.fulfillCount == 0)
    #expect(action.failCount == 0)
}
#endif
