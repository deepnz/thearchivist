import Foundation

/// Everything the app needs to run entirely on-device: the full library,
/// watchlists, and the queue of changes not yet accepted by CloudKit.
struct LibrarySnapshot: Codable {
    var schemaVersion: Int = 1
    var items: [LibraryItem] = []
    var watchlists: [Watchlist] = []
    var pendingItemSaves: [String] = []      // LibraryItem.id
    var pendingItemDeletes: [String] = []    // CKRecord recordNames
    var pendingListSaves: [String] = []      // Watchlist.id
    var pendingListDeletes: [String] = []    // CKRecord recordNames
}

/// On-device persistence for the library.
///
/// tvOS only guarantees write access to Caches and tmp, and Caches may be
/// purged under storage pressure — which is safe here because CloudKit holds
/// the durable copy and the app re-fetches on next launch. In the common case
/// the snapshot makes the app fully readable and editable with no network.
final class LocalStore {
    private let fileURL: URL

    init(directory: URL? = nil) {
        let dir = directory
            ?? FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first
            ?? FileManager.default.temporaryDirectory
        self.fileURL = dir.appendingPathComponent("library-snapshot.json")
    }

    func load() -> LibrarySnapshot? {
        guard let data = try? Data(contentsOf: fileURL) else { return nil }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try? decoder.decode(LibrarySnapshot.self, from: data)
    }

    func save(_ snapshot: LibrarySnapshot) {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        guard let data = try? encoder.encode(snapshot) else { return }
        try? data.write(to: fileURL, options: .atomic)
    }

    func clear() {
        try? FileManager.default.removeItem(at: fileURL)
    }
}
