import Foundation
import CloudKit

enum MediaType: String, Codable {
    case film = "film"
    case series = "series"
}

struct LibraryItem: Identifiable, Hashable {
    let id: String            // CKRecord.ID recordName (UUID string)
    var catalogID: String     // display-only: MV-XXXX or SV-XXXX
    var iTunesID: String      // dedup + deep link key
    var title: String
    var year: Int
    var type: MediaType
    var artworkURL: String
    var storeURL: String      // canonical iTunes Store URL (trackViewUrl/collectionViewUrl)
    var genres: [String]
    var watched: Bool
    var dateAdded: Date
    // Preserved so updates retain the server changeTag. In-memory only —
    // excluded from Codable and rebuilt from CloudKit after a cache reload.
    var ckRecord: CKRecord? = nil

    func hash(into hasher: inout Hasher) { hasher.combine(id) }
    static func == (lhs: LibraryItem, rhs: LibraryItem) -> Bool { lhs.id == rhs.id }

    // MARK: - CKRecord keys
    private enum Keys {
        static let catalogID = "catalogID"
        static let iTunesID = "iTunesID"
        static let title = "title"
        static let year = "year"
        static let type = "type"
        static let artworkURL = "artworkURL"
        static let storeURL = "storeURL"
        static let genres = "genres"
        static let watched = "watched"
        static let dateAdded = "dateAdded"
    }

    static let recordType = "LibraryItem"

    /// Writes all fields onto an existing record. Used both for building a
    /// fresh record and for merging onto the server's copy after a conflict.
    func apply(to record: CKRecord) -> CKRecord {
        record[Keys.catalogID] = catalogID
        record[Keys.iTunesID] = iTunesID
        record[Keys.title] = title
        record[Keys.year] = year
        record[Keys.type] = type.rawValue
        record[Keys.artworkURL] = artworkURL
        record[Keys.storeURL] = storeURL
        record[Keys.genres] = genres
        record[Keys.watched] = watched ? 1 : 0
        record[Keys.dateAdded] = dateAdded
        return record
    }

    func toCKRecord() -> CKRecord {
        // Reuse the existing record to preserve the server changeTag for updates
        let record = ckRecord ?? CKRecord(recordType: Self.recordType,
                                          recordID: CKRecord.ID(recordName: id))
        return apply(to: record)
    }

    init?(record: CKRecord) {
        guard
            let catalogID = record[Keys.catalogID] as? String,
            let iTunesID = record[Keys.iTunesID] as? String,
            let title = record[Keys.title] as? String,
            let year = record[Keys.year] as? Int,
            let typeRaw = record[Keys.type] as? String,
            let type = MediaType(rawValue: typeRaw),
            let artworkURL = record[Keys.artworkURL] as? String,
            let watchedInt = record[Keys.watched] as? Int,
            let dateAdded = record[Keys.dateAdded] as? Date
        else { return nil }

        self.id = record.recordID.recordName
        self.catalogID = catalogID
        self.iTunesID = iTunesID
        self.title = title
        self.year = year
        self.type = type
        self.artworkURL = artworkURL
        self.storeURL = record[Keys.storeURL] as? String ?? "" // absent on legacy records
        self.genres = record[Keys.genres] as? [String] ?? []
        self.watched = watchedInt == 1
        self.dateAdded = dateAdded
        self.ckRecord = record
    }

    init(id: String, catalogID: String, iTunesID: String, title: String, year: Int,
         type: MediaType, artworkURL: String, storeURL: String = "", genres: [String],
         watched: Bool, dateAdded: Date) {
        self.id = id
        self.catalogID = catalogID
        self.iTunesID = iTunesID
        self.title = title
        self.year = year
        self.type = type
        self.artworkURL = artworkURL
        self.storeURL = storeURL
        self.genres = genres
        self.watched = watched
        self.dateAdded = dateAdded
        self.ckRecord = nil
    }
}

// MARK: - Codable (local snapshot persistence; ckRecord intentionally excluded)
extension LibraryItem: Codable {
    private enum CodingKeys: String, CodingKey {
        case id, catalogID, iTunesID, title, year, type,
             artworkURL, storeURL, genres, watched, dateAdded
    }
}
