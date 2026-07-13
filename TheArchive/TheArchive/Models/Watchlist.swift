import Foundation
import CloudKit

struct Watchlist: Identifiable, Hashable {
    let id: String       // CKRecord.ID recordName (UUID string)
    var name: String
    var itemIDs: [String]  // iTunesID values
    // In-memory only — excluded from Codable, rebuilt from CloudKit after a cache reload.
    var ckRecord: CKRecord? = nil

    func hash(into hasher: inout Hasher) { hasher.combine(id) }
    static func == (lhs: Watchlist, rhs: Watchlist) -> Bool { lhs.id == rhs.id }

    private enum Keys {
        static let name = "name"
        static let itemIDs = "itemIDs"
    }

    static let recordType = "Watchlist"

    /// Writes all fields onto an existing record. Used both for building a
    /// fresh record and for merging onto the server's copy after a conflict.
    func apply(to record: CKRecord) -> CKRecord {
        record[Keys.name] = name
        record[Keys.itemIDs] = itemIDs
        return record
    }

    func toCKRecord() -> CKRecord {
        let record = ckRecord ?? CKRecord(recordType: Self.recordType,
                                          recordID: CKRecord.ID(recordName: id))
        return apply(to: record)
    }

    init?(record: CKRecord) {
        guard let name = record[Keys.name] as? String else { return nil }
        self.id = record.recordID.recordName
        self.name = name
        self.itemIDs = record[Keys.itemIDs] as? [String] ?? []
        self.ckRecord = record
    }

    init(id: String, name: String, itemIDs: [String]) {
        self.id = id
        self.name = name
        self.itemIDs = itemIDs
        self.ckRecord = nil
    }
}

// MARK: - Codable (local snapshot persistence; ckRecord intentionally excluded)
extension Watchlist: Codable {
    private enum CodingKeys: String, CodingKey {
        case id, name, itemIDs
    }
}
