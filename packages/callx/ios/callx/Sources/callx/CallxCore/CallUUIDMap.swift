import CryptoKit
import Foundation

/// Stable CallKit UUIDs for Callx call IDs. A call ID that is already a UUID is used as is;
/// any other ID maps to a name-based (version 5) UUID, so the mapping survives restarts.
public final class CallUUIDMap: @unchecked Sendable {
    private static let namespace = UUID(uuidString: "4F6A1B2C-8D3E-4F50-9A61-7B2C3D4E5F60")!
    private let lock = NSLock()
    private var callIDs: [UUID: String] = [:]
    public init() {}

    public func uuid(for callID: String) -> UUID {
        let uuid = UUID(uuidString: callID) ?? Self.nameBased(callID)
        lock.lock(); callIDs[uuid] = callID; lock.unlock()
        return uuid
    }

    /// The call ID for a UUID this map produced in the current process.
    public func callID(for uuid: UUID) -> String? {
        lock.lock(); defer { lock.unlock() }
        return callIDs[uuid]
    }

    static func nameBased(_ name: String) -> UUID {
        var data = withUnsafeBytes(of: namespace.uuid) { Data($0) }
        data.append(Data(name.utf8))
        var bytes = Array(Insecure.SHA1.hash(data: data).prefix(16))
        bytes[6] = (bytes[6] & 0x0F) | 0x50
        bytes[8] = (bytes[8] & 0x3F) | 0x80
        return UUID(uuid: (bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5], bytes[6], bytes[7],
            bytes[8], bytes[9], bytes[10], bytes[11], bytes[12], bytes[13], bytes[14], bytes[15]))
    }
}
