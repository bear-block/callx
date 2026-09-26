import Foundation

/// What the platform layer does with an invitation after the coordinator decided its outcome.
public enum IncomingReportDecision: Equatable, Sendable {
    /// Report the call and let it ring.
    case ring
    /// iOS must report this push: report the live call's ID again and do not end it.
    case reportExisting
    /// iOS must report this push: report it under a fresh ID and end it immediately with this reason.
    case reportEnded(reason: String)
    /// Nothing is shown.
    case skip
}

public enum IncomingReportPolicy {
    /// `outcome` is nil when the payload could not be decoded. `mustReport` is false on Android and
    /// for iOS pushes whose metadata says reporting is not required.
    public static func decide(_ outcome: IncomingOutcome?, mustReport: Bool) -> IncomingReportDecision {
        guard let outcome else { return mustReport ? .reportEnded(reason: "failed") : .skip }
        switch outcome {
        case .accepted: return .ring
        case .duplicate: return mustReport ? .reportExisting : .skip
        case .ended(let reason): return mustReport ? .reportEnded(reason: reason) : .skip
        case .busy: return mustReport ? .reportEnded(reason: "busy") : .skip
        case .expired: return mustReport ? .reportEnded(reason: "unanswered") : .skip
        }
    }

    /// The tombstone recorded for a rejected invitation so a repeat push cannot ring later.
    public static func tombstoneReason(_ outcome: IncomingOutcome) -> String? {
        switch outcome {
        case .busy: return "busy"
        case .expired: return "unanswered"
        case .accepted, .duplicate, .ended: return nil
        }
    }
}
