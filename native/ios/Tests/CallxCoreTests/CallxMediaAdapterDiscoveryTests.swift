#if os(iOS)
import AVFAudio
import Foundation
import Testing
@testable import CallxCore

private final class DiscoveredAdapter: CallxMediaAdapter, @unchecked Sendable {
    let apiVersion: Int
    init(apiVersion: Int) { self.apiVersion = apiVersion }
    func start(callID: String, sink: any CallxMediaSink) {}
    func stop(callID: String) {}
    func setMuted(callID: String, muted: Bool) async -> Bool { true }
    func didActivate(_ audioSession: AVAudioSession) {}
    func didDeactivate(_ audioSession: AVAudioSession) {}
}

@objc(CallxTestAdapterFactory)
final class TestAdapterFactory: NSObject, CallxMediaAdapterFactory {
    override init() {}
    func makeAdapter(context: CallxAdapterContext) throws -> any CallxMediaAdapter { DiscoveredAdapter(apiVersion: callxMediaAPIVersion) }
}

@objc(CallxFutureAdapterFactory)
final class FutureAdapterFactory: NSObject, CallxMediaAdapterFactory {
    override init() {}
    func makeAdapter(context: CallxAdapterContext) throws -> any CallxMediaAdapter { DiscoveredAdapter(apiVersion: 2) }
}

private struct NoTokenSource: Error {}
@objc(CallxFailingAdapterFactory)
final class FailingAdapterFactory: NSObject, CallxMediaAdapterFactory {
    override init() {}
    func makeAdapter(context: CallxAdapterContext) throws -> any CallxMediaAdapter { throw NoTokenSource() }
}

private let context = CallxAdapterContext(log: { _ in })
private func resolve(_ names: [String]) -> CallxMediaAdapterResolution {
    CallxMediaAdapters.resolve(names: names, context: context) { NSClassFromString($0) as? any CallxMediaAdapterFactory.Type }
}

@Test func noDeclaredAdapterMeansTheHostBringsItsOwnMedia() {
    guard case .none = resolve([]) else { Issue.record("expected none"); return }
}

@Test func oneDeclaredAdapterIsCreatedByItsObjectiveCName() {
    guard case .resolved(_, let source) = resolve(["CallxTestAdapterFactory"]) else { Issue.record("expected resolved"); return }
    #expect(source == "CallxTestAdapterFactory")
}

@Test func twoMediaAdaptersAreAConflictNotAChoice() {
    guard case .conflict(let sources) = resolve(["CallxTestAdapterFactory", "CallxFutureAdapterFactory"]) else {
        Issue.record("expected conflict"); return
    }
    #expect(sources == ["CallxFutureAdapterFactory", "CallxTestAdapterFactory"])
    // The same factory listed twice (two plugin runs) is not a conflict.
    guard case .resolved = resolve(["CallxTestAdapterFactory", "CallxTestAdapterFactory"]) else { Issue.record("expected resolved"); return }
}

@Test func brokenDeclarationsLeaveCallsWithoutMediaAndSayWhy() {
    guard case .unavailable(_, let missing) = resolve(["NotLinkedFactory"]) else { Issue.record("expected unavailable"); return }
    #expect(missing.contains("NotLinkedFactory"))
    guard case .unavailable(_, let failing) = resolve(["CallxFailingAdapterFactory"]) else { Issue.record("expected unavailable"); return }
    #expect(failing.contains("NoTokenSource"))
    guard case .unavailable(_, let version) = resolve(["CallxFutureAdapterFactory"]) else { Issue.record("expected unavailable"); return }
    #expect(version.contains("API 2"))
}
#endif
