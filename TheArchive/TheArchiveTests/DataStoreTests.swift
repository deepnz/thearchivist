import XCTest
@testable import TheArchive

/// Tests the pure merge policy DataStore applies when reconciling a CloudKit
/// fetch with local state (full DataStore flows require a CloudKit container
/// and are covered by device testing).
final class DataStoreTests: XCTestCase {

    private func makeItem(id: String, title: String) -> LibraryItem {
        LibraryItem(id: id, catalogID: "MV-0001", iTunesID: "it-\(id)",
                    title: title, year: 2020, type: .film, artworkURL: "",
                    genres: [], watched: false, dateAdded: Date())
    }

    func test_merge_serverWins_whenNoPendingChanges() {
        let remote = [makeItem(id: "1", title: "Server Title")]
        let local = [makeItem(id: "1", title: "Old Local Title")]
        let merged = DataStore.merge(remote: remote, localItems: local,
                                     pendingSaves: [], pendingDeletes: [])
        XCTAssertEqual(merged.count, 1)
        XCTAssertEqual(merged.first?.title, "Server Title")
    }

    func test_merge_localPendingSave_beatsServer() {
        let remote = [makeItem(id: "1", title: "Server Title")]
        let local = [makeItem(id: "1", title: "Unsynced Local Edit")]
        let merged = DataStore.merge(remote: remote, localItems: local,
                                     pendingSaves: ["1"], pendingDeletes: [])
        XCTAssertEqual(merged.first?.title, "Unsynced Local Edit")
    }

    func test_merge_localPendingAdd_notOnServer_isKept() {
        let remote: [LibraryItem] = []
        let local = [makeItem(id: "1", title: "Added Offline")]
        let merged = DataStore.merge(remote: remote, localItems: local,
                                     pendingSaves: ["1"], pendingDeletes: [])
        XCTAssertEqual(merged.count, 1)
        XCTAssertEqual(merged.first?.title, "Added Offline")
    }

    func test_merge_pendingDelete_excludesServerRecord() {
        let remote = [makeItem(id: "1", title: "Deleted Offline"),
                      makeItem(id: "2", title: "Keep Me")]
        let merged = DataStore.merge(remote: remote, localItems: [],
                                     pendingSaves: [], pendingDeletes: ["1"])
        XCTAssertEqual(merged.map(\.id), ["2"])
    }

    func test_merge_pendingSave_forItemDeletedLocally_isDropped() {
        // The pending-save id no longer exists locally — nothing to resurrect.
        let remote: [LibraryItem] = []
        let merged = DataStore.merge(remote: remote, localItems: [],
                                     pendingSaves: ["ghost"], pendingDeletes: [])
        XCTAssertTrue(merged.isEmpty)
    }

    func test_merge_worksForWatchlists() {
        let remote = [Watchlist(id: "w1", name: "Server Name", itemIDs: [])]
        let local = [Watchlist(id: "w1", name: "Local Rename", itemIDs: ["111"])]
        let merged = DataStore.merge(remote: remote, localItems: local,
                                     pendingSaves: ["w1"], pendingDeletes: [])
        XCTAssertEqual(merged.first?.name, "Local Rename")
        XCTAssertEqual(merged.first?.itemIDs, ["111"])
    }
}
