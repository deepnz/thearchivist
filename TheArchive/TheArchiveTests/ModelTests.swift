import XCTest
import CloudKit
@testable import TheArchive

final class ModelTests: XCTestCase {

    private func makeItem() -> LibraryItem {
        LibraryItem(
            id: UUID().uuidString,
            catalogID: "MV-0001",
            iTunesID: "12345",
            title: "Inception",
            year: 2010,
            type: .film,
            artworkURL: "https://example.com/art.jpg",
            storeURL: "https://itunes.apple.com/us/movie/inception/id12345?uo=4",
            genres: ["Sci-Fi"],
            watched: false,
            dateAdded: Date(timeIntervalSince1970: 0)
        )
    }

    func test_libraryItem_roundtrip_film() {
        let item = makeItem()
        let record = item.toCKRecord()
        let restored = LibraryItem(record: record)
        XCTAssertNotNil(restored)
        XCTAssertEqual(restored?.title, "Inception")
        XCTAssertEqual(restored?.iTunesID, "12345")
        XCTAssertEqual(restored?.type, .film)
        XCTAssertEqual(restored?.storeURL, "https://itunes.apple.com/us/movie/inception/id12345?uo=4")
        XCTAssertEqual(restored?.genres, ["Sci-Fi"])
        XCTAssertEqual(restored?.watched, false)
    }

    func test_libraryItem_roundtrip_series() {
        let item = LibraryItem(
            id: UUID().uuidString,
            catalogID: "SV-0001",
            iTunesID: "67890",
            title: "Breaking Bad",
            year: 2008,
            type: .series,
            artworkURL: "",
            genres: [],
            watched: true,
            dateAdded: Date(timeIntervalSince1970: 0)
        )
        let record = item.toCKRecord()
        let restored = LibraryItem(record: record)
        XCTAssertEqual(restored?.type, .series)
        XCTAssertEqual(restored?.watched, true)
        XCTAssertEqual(restored?.storeURL, "") // default when not provided
    }

    func test_libraryItem_legacyRecord_withoutStoreURL_decodes() {
        // Records saved before the storeURL field existed must still load.
        var item = makeItem()
        item.storeURL = ""
        let record = item.toCKRecord()
        record["storeURL"] = nil as String?
        let restored = LibraryItem(record: record)
        XCTAssertNotNil(restored)
        XCTAssertEqual(restored?.storeURL, "")
    }

    func test_libraryItem_toCKRecord_reusesServerRecord() {
        // Updates must reuse the fetched record so the server changeTag survives.
        let original = makeItem().toCKRecord()
        var restored = LibraryItem(record: original)!
        restored.watched = true
        let updated = restored.toCKRecord()
        XCTAssertTrue(updated === original)
        XCTAssertEqual(updated["watched"] as? Int, 1)
    }

    func test_libraryItem_codable_roundtrip_excludesRecord() throws {
        let record = makeItem().toCKRecord()
        let item = LibraryItem(record: record)!
        XCTAssertNotNil(item.ckRecord)

        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601

        let data = try encoder.encode(item)
        let decoded = try decoder.decode(LibraryItem.self, from: data)

        XCTAssertEqual(decoded.id, item.id)
        XCTAssertEqual(decoded.title, item.title)
        XCTAssertEqual(decoded.storeURL, item.storeURL)
        XCTAssertEqual(decoded.genres, item.genres)
        XCTAssertEqual(decoded.watched, item.watched)
        XCTAssertNil(decoded.ckRecord) // in-memory only, rebuilt from CloudKit
    }

    func test_watchlist_roundtrip() {
        let list = Watchlist(id: UUID().uuidString, name: "Weekend", itemIDs: ["111", "222"])
        let record = list.toCKRecord()
        let restored = Watchlist(record: record)
        XCTAssertEqual(restored?.name, "Weekend")
        XCTAssertEqual(restored?.itemIDs, ["111", "222"])
    }

    func test_watchlist_toCKRecord_reusesServerRecord() {
        let original = Watchlist(id: "w1", name: "Weekend", itemIDs: []).toCKRecord()
        var restored = Watchlist(record: original)!
        restored.itemIDs = ["111"]
        let updated = restored.toCKRecord()
        XCTAssertTrue(updated === original)
        XCTAssertEqual(updated["itemIDs"] as? [String], ["111"])
    }

    func test_watchlist_codable_roundtrip() throws {
        let list = Watchlist(id: "w1", name: "Weekend", itemIDs: ["111"])
        let data = try JSONEncoder().encode(list)
        let decoded = try JSONDecoder().decode(Watchlist.self, from: data)
        XCTAssertEqual(decoded.id, "w1")
        XCTAssertEqual(decoded.name, "Weekend")
        XCTAssertEqual(decoded.itemIDs, ["111"])
        XCTAssertNil(decoded.ckRecord)
    }
}
