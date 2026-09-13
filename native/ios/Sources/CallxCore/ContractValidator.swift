import Foundation

public struct ContractManifest: Sendable {
    public let version: String
    public let callStates: Set<String>
    public let directions: Set<String>
    public let endReasons: Set<String>
    public let commands: Set<String>
    public let statuses: Set<String>
    public let errors: Set<String>
    public let events: Set<String>
    public let sources: Set<String>
    public let lookups: Set<String>
    public let sessions: Set<String>
    public let identifierPattern: String
    public let identifierMaxBytes: Int

    public init(json: [String: Any]) throws {
        func strings(_ key: String) throws -> Set<String> {
            guard let value = json[key] as? [String] else { throw ContractViolation("manifest.\(key)") }
            return Set(value)
        }
        guard let version = json["contractVersion"] as? String,
              let limits = json["limits"] as? [String: Any],
              let pattern = limits["identifierPattern"] as? String,
              let maxBytes = limits["identifierMaxUtf8Bytes"] as? Int else {
            throw ContractViolation("manifest shape")
        }
        self.version = version
        callStates = try strings("callStates"); directions = try strings("callDirections")
        endReasons = try strings("endReasons"); commands = try strings("commandTypes")
        statuses = try strings("commandStatuses"); errors = try strings("errorCodes")
        events = try strings("eventKinds"); sources = try strings("eventSources")
        lookups = try strings("operationLookupStatuses"); sessions = try strings("sessionOpenStatuses")
        identifierPattern = pattern; identifierMaxBytes = maxBytes
    }
}

public struct ContractViolation: Error, CustomStringConvertible, Sendable {
    public let description: String
    public init(_ description: String) { self.description = description }
}

public struct ContractValidator: Sendable {
    private let manifest: ContractManifest
    public init(manifest: ContractManifest) { self.manifest = manifest }

    public func validateFixture(_ fixture: [String: Any]) throws {
        if let value = fixture["command"] { try command(object(value, "command")) }
        if let value = fixture["result"] { try result(object(value, "result")) }
        if let value = fixture["call"] { try call(object(value, "call"), "call") }
        if let value = fixture["snapshot"] { try snapshot(object(value, "snapshot")) }
        if let value = fixture["event"] { try event(object(value, "event")) }
        if let value = fixture["operationLookup"] { try lookup(object(value, "operationLookup")) }
        if let value = fixture["session"] { try session(object(value, "session")) }
    }

    private func object(_ value: Any, _ path: String) throws -> [String: Any] {
        guard let value = value as? [String: Any] else { throw ContractViolation("\(path) must be object") }
        return value
    }
    private func member(_ value: Any?, _ set: Set<String>, _ path: String) throws {
        guard let value = value as? String, set.contains(value) else { throw ContractViolation("\(path) unsupported") }
    }
    private func version(_ value: Any?, _ path: String) throws {
        guard value as? String == manifest.version else { throw ContractViolation("\(path) incompatible") }
    }
    private func id(_ value: Any?, _ path: String) throws {
        guard let value = value as? String,
              value.utf8.count <= manifest.identifierMaxBytes,
              value.range(of: manifest.identifierPattern, options: .regularExpression)?.lowerBound == value.startIndex,
              value.range(of: manifest.identifierPattern, options: .regularExpression)?.upperBound == value.endIndex
        else { throw ContractViolation("\(path) invalid identifier") }
    }
    private func timestamp(_ value: Any?, _ path: String) throws {
        guard let number = value as? NSNumber, CFGetTypeID(number) != CFBooleanGetTypeID(),
              number.doubleValue >= 0, number.doubleValue <= 9_007_199_254_740_991,
              number.doubleValue.rounded() == number.doubleValue else { throw ContractViolation("\(path) invalid timestamp") }
    }
    private func counter(_ value: Any?, _ path: String) throws {
        guard let value = value as? String,
              value.range(of: "^(0|[1-9][0-9]*)$", options: .regularExpression) != nil
        else { throw ContractViolation("\(path) invalid counter") }
    }
    private func boolean(_ value: Any?, _ path: String) throws {
        guard let number = value as? NSNumber, CFGetTypeID(number) == CFBooleanGetTypeID()
        else { throw ContractViolation("\(path) must be boolean") }
    }

    private func command(_ value: [String: Any]) throws {
        try version(value["contractVersion"], "command.contractVersion")
        try id(value["operationId"], "command.operationId")
        try member(value["type"], manifest.commands, "command.type")
        if let deadline = value["deadlineAtMs"] { try timestamp(deadline, "command.deadlineAtMs") }
        if value["type"] as? String == "startCall" {
            let input = try object(value["input"] as Any, "command.input")
            try id(input["callId"], "command.input.callId")
            guard let name = input["displayName"] as? String, !name.isEmpty, name.utf8.count <= 256
            else { throw ContractViolation("command.input.displayName invalid") }
            guard value["callId"] == nil, value["value"] == nil else { throw ContractViolation("startCall forbidden fields") }
        } else {
            try id(value["callId"], "command.callId")
            let needsValue = ["setMuted", "setHeld"].contains(value["type"] as? String)
            if needsValue { try boolean(value["value"], "command.value") }
            else if value["value"] != nil { throw ContractViolation("command.value forbidden") }
            guard value["input"] == nil else { throw ContractViolation("command.input forbidden") }
        }
    }

    private func result(_ value: [String: Any]) throws {
        try version(value["contractVersion"], "result.contractVersion")
        try id(value["operationId"], "result.operationId")
        try member(value["status"], manifest.statuses, "result.status")
        try timestamp(value["completedAtMs"], "result.completedAtMs")
        if value["status"] as? String == "applied" {
            guard value["error"] == nil else { throw ContractViolation("applied result has error") }
        } else {
            let error = try object(value["error"] as Any, "result.error")
            try member(error["code"], manifest.errors, "result.error.code")
            guard let message = error["message"] as? String, !message.isEmpty, message.utf8.count <= 512
            else { throw ContractViolation("result.error.message invalid") }
            try boolean(error["retryable"], "result.error.retryable")
            if value["status"] as? String == "timedOut", error["code"] as? String != "deadlineExceeded" {
                throw ContractViolation("timedOut code invalid")
            }
        }
    }

    private func call(_ value: [String: Any], _ path: String) throws {
        try id(value["callId"], "\(path).callId"); try member(value["direction"], manifest.directions, "\(path).direction")
        try member(value["state"], manifest.callStates, "\(path).state")
        try boolean(value["muted"], "\(path).muted"); try boolean(value["mediaReady"], "\(path).mediaReady")
        let state = value["state"] as? String; let ready = (value["mediaReady"] as? NSNumber)?.boolValue
        if state == "active", ready != true { throw ContractViolation("active requires media") }
        if state == "active", value["mediaConnectedAtMs"] == nil { throw ContractViolation("active requires milestone") }
        if state == "ended" { try member(value["endReason"], manifest.endReasons, "\(path).endReason") }
        else if value["endReason"] != nil { throw ContractViolation("live endReason") }
        for field in ["createdAtMs", "acceptedAtMs", "mediaConnectedAtMs", "endedAtMs"] {
            if let timestampValue = value[field] { try timestamp(timestampValue, "\(path).\(field)") }
        }
    }

    private func snapshot(_ value: [String: Any]) throws {
        try version(value["contractVersion"], "snapshot.contractVersion"); try counter(value["watermark"], "snapshot.watermark")
        guard let calls = value["calls"] as? [[String: Any]], calls.count <= 1 else { throw ContractViolation("snapshot.calls invalid") }
        for (index, value) in calls.enumerated() { try call(value, "snapshot.calls[\(index)]") }
    }
    private func event(_ value: [String: Any]) throws {
        try version(value["contractVersion"], "event.contractVersion"); try id(value["eventId"], "event.eventId")
        try counter(value["sequence"], "event.sequence"); try member(value["kind"], manifest.events, "event.kind")
        try member(value["source"], manifest.sources, "event.source"); try timestamp(value["observedAtMs"], "event.observedAtMs")
    }
    private func lookup(_ value: [String: Any]) throws {
        try version(value["contractVersion"], "lookup.contractVersion"); try id(value["operationId"], "lookup.operationId")
        try id(value["accountGeneration"], "lookup.accountGeneration"); try member(value["status"], manifest.lookups, "lookup.status")
        if value["status"] as? String == "available" { try result(object(value["result"] as Any, "lookup.result")) }
        else if value["result"] != nil { throw ContractViolation("unavailable lookup result") }
    }
    private func session(_ value: [String: Any]) throws {
        try version(value["contractVersion"], "session.contractVersion"); try id(value["sessionId"], "session.sessionId")
        try id(value["accountGeneration"], "session.accountGeneration"); try member(value["status"], manifest.sessions, "session.status")
        try snapshot(object(value["snapshot"] as Any, "session.snapshot"))
        guard let replay = value["replay"] as? [[String: Any]] else { throw ContractViolation("session.replay invalid") }
        for value in replay { try event(value) }
        if value["status"] as? String == "fresh", !replay.isEmpty { throw ContractViolation("fresh replay") }
    }
}
