import XCTest
@testable import TheArchive

final class LocalStoreTests: XCTestCase {

    private var tempDir: URL!
    private var store: LocalStore!

    override func setUpWithError() throws {
        tempDir = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: tempDir, withIntermediateDirectories: true)
        store = LocalStore(directory: tempDir)
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(at: tempDir)
    }

    private func makeItem(id: String, title: String) -> LibraryItem {
        LibraryItem(id: id, catalogID: "MV-0001", iTunesID: "itunes-\(id)",
                    title: title, year: 2020, type: .film,
                    artworkURL: "https://example.com/a.jpg",
                    storeURL: "https://itunes.apple.com/us/movie/x/id1?uo=4",
                    genres: ["Drama"], watched: true,
                    dateAdded: Date(timeIntervalSince1970: 1_000_000))
    }

    func test_load_returnsNil_whenNoSnapshot() {
        XCTAssertNil(store.load())
    }

    func test_save_load_roundtrip() {
        let snapshot = LibrarySnapshot(
            items: [makeItem(id: "1", title: "Inception")],
            watchlists: [Watchlist(id: "w1", name: "Weekend", itemIDs: ["itunes-1"])],
            pendingItemSaves: ["1"],
            pendingItemDeletes: ["gone"],
            pendingListSaves: ["w1"],
            pendingListDeletes: []
        )
        store.save(snapshot)

        let loaded = store.load()
        XCTAssertNotNil(loaded)
        XCTAssertEqual(loaded?.items.count, 1)
        XCTAssertEqual(loaded?.items.first?.title, "Inception")
        XCTAssertEqual(loaded?.items.first?.watched, true)
        XCTAssertEqual(loaded?.items.first?.genres, ["Drama"])
        XCTAssertEqual(loaded?.items.first?.dateAdded, Date(timeIntervalSince1970: 1_000_000))
        XCTAssertEqual(loaded?.watchlists.first?.itemIDs, ["itunes-1"])
        XCTAssertEqual(loaded?.pendingItemSaves, ["1"])
        XCTAssertEqual(loaded?.pendingItemDeletes, ["gone"])
        XCTAssertEqual(loaded?.pendingListSaves, ["w1"])
    }

    func test_save_overwritesPreviousSnapshot() {
        store.save(LibrarySnapshot(items: [makeItem(id: "1", title: "First")]))
        store.save(LibrarySnapshot(items: [makeItem(id: "2", title: "Second")]))
        let loaded = store.load()
        XCTAssertEqual(loaded?.items.count, 1)
        XCTAssertEqual(loaded?.items.first?.title, "Second")
    }

    func test_clear_removesSnapshot() {
        store.save(LibrarySnapshot(items: [makeItem(id: "1", title: "Inception")]))
        store.clear()
        XCTAssertNil(store.load())
    }

    func test_load_toleratesCorruptFile() throws {
        let file = tempDir.appendingPathComponent("library-snapshot.json")
        try Data("not json".utf8).write(to: file)
        XCTAssertNil(store.load())
    }
}
