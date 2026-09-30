#if os(iOS)
import Foundation

/// What an adapter factory receives when the core creates its adapter.
public struct CallxAdapterContext: Sendable {
    public let log: @Sendable (String) -> Void
    public init(log: @escaping @Sendable (String) -> Void) { self.log = log }
}

/// Creates a media adapter. An adapter package adds its factory's Objective-C class name to the
/// `CallxMediaAdapterFactories` array in the app's Info.plist (its Expo plugin does this; Flutter
/// hosts add it once), so installing the package is enough (ADR-0009). Give the class a stable
/// name with `@objc(Name)`.
public protocol CallxMediaAdapterFactory: NSObject {
    init()
    func makeAdapter(context: CallxAdapterContext) throws -> any CallxMediaAdapter
}

/// The outcome of looking for a media adapter.
public enum CallxMediaAdapterResolution {
    /// No adapter is installed: the host brings its own media or uses the listener callbacks.
    case none
    case resolved(any CallxMediaAdapter, source: String)
    /// More than one media adapter is installed; the core does not pick one.
    case conflict(sources: [String])
    /// An adapter is installed but cannot be used; calls still ring, without media.
    case unavailable(source: String, reason: String)
}

public enum CallxMediaAdapters {
    public static let infoPlistKey = "CallxMediaAdapterFactories"

    /// Finds the media adapter declared in the main bundle's Info.plist and creates it.
    public static func discover(context: CallxAdapterContext, bundle: Bundle = .main) -> CallxMediaAdapterResolution {
        let names = bundle.object(forInfoDictionaryKey: infoPlistKey) as? [String] ?? []
        return resolve(names: names, context: context) { NSClassFromString($0) as? any CallxMediaAdapterFactory.Type }
    }

    /// Resolution without the bundle. `load` returns the factory type for a class name.
    public static func resolve(names: [String], context: CallxAdapterContext,
        load: (String) -> (any CallxMediaAdapterFactory.Type)?) -> CallxMediaAdapterResolution {
        let declared = Array(Set(names.filter { !$0.isEmpty })).sorted()
        guard let name = declared.first else { return .none }
        if declared.count > 1 { return .conflict(sources: declared) }
        guard let type = load(name) else {
            return .unavailable(source: name, reason: "\(name) is not a linked CallxMediaAdapterFactory class.")
        }
        let adapter: any CallxMediaAdapter
        do { adapter = try type.init().makeAdapter(context: context) }
        catch { return .unavailable(source: name, reason: "\(name) failed to create an adapter: \(error)") }
        guard CallKitIngress.supports(adapter) else {
            return .unavailable(source: name, reason:
                "\(name) implements media adapter API \(adapter.apiVersion); this Callx supports \(callxMediaAPIVersion).")
        }
        return .resolved(adapter, source: name)
    }
}
#endif
