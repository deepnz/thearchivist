import Foundation
import CloudKit

struct Watchlist: Identifiable, Hashable {
    let id: String       // CKRecord.ID recordName (UUID string)
    var name: String
    var itemIDs: [String]  // iTunesID values
    var ckRecord: CKRecord?

    func hash(into hasher: inout Hasher) { hasher.combine(id) }
    static func == (lhs: Watchlist, rhs: Watchlist) -> Bool { lhs.id == rhs.id }

    private enum Keys {
        static let name = "name"
        static let itemIDs = "itemIDs"
    }

    static let recordType = "Watchlist"

    func toCKRecord() -> CKRecord {
        let record = ckRecord ?? CKRecord(recordType: Self.recordType,
                                          recordID: CKRecord.ID(recordName: id))
        record[Keys.name] = name
        // See LibraryItem.toCKRecord: an empty array cannot initialize a new
        // list field, and a new watchlist always starts empty.
        if itemIDs.isEmpty {
            record[Keys.itemIDs] = nil
        } else {
            record[Keys.itemIDs] = itemIDs
        }
        return record
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
