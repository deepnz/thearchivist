import Foundation
import CloudKit

enum MediaType: String {
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
    var genres: [String]
    var watched: Bool
    var dateAdded: Date
    // Preserved so updates retain the server changeTag
    var ckRecord: CKRecord?

    /// Year as a bare 4-digit string, for use in `Text`.
    ///
    /// A string containing interpolation binds to `Text`'s `LocalizedStringKey`
    /// overload, which formats interpolated numbers with locale grouping and
    /// renders 1954 as "1,954". Converting to String first selects the
    /// `Text(String)` overload, which does no formatting. The same applies to a
    /// ternary of such strings, so both shapes need this.
    var yearText: String { String(year) }

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
        static let genres = "genres"
        static let watched = "watched"
        static let dateAdded = "dateAdded"
    }

    static let recordType = "LibraryItem"

    func toCKRecord() -> CKRecord {
        // Reuse the existing record to preserve the server changeTag for updates
        let record = ckRecord ?? CKRecord(recordType: Self.recordType,
                                          recordID: CKRecord.ID(recordName: id))
        record[Keys.catalogID] = catalogID
        record[Keys.iTunesID] = iTunesID
        record[Keys.title] = title
        record[Keys.year] = year
        record[Keys.type] = type.rawValue
        record[Keys.artworkURL] = artworkURL
        // CloudKit cannot infer a list's element type from an empty array when
        // the field does not exist yet: it rejects the save with "cannot use an
        // empty list to initialize a new field". Omitting the key entirely is
        // equivalent, since the decoder already defaults a missing value to [].
        if genres.isEmpty {
            record[Keys.genres] = nil
        } else {
            record[Keys.genres] = genres
        }
        record[Keys.watched] = watched ? 1 : 0
        record[Keys.dateAdded] = dateAdded
        return record
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
        self.genres = record[Keys.genres] as? [String] ?? []
        self.watched = watchedInt == 1
        self.dateAdded = dateAdded
        self.ckRecord = record
    }

    init(id: String, catalogID: String, iTunesID: String, title: String, year: Int,
         type: MediaType, artworkURL: String, genres: [String], watched: Bool, dateAdded: Date) {
        self.id = id
        self.catalogID = catalogID
        self.iTunesID = iTunesID
        self.title = title
        self.year = year
        self.type = type
        self.artworkURL = artworkURL
        self.genres = genres
        self.watched = watched
        self.dateAdded = dateAdded
        self.ckRecord = nil
    }
}
