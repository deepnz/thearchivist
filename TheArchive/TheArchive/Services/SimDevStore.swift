#if DEBUG && targetEnvironment(simulator)
import Foundation

enum SimDevStore {
    private struct ItemDTO: Codable {
        let id, catalogID, iTunesID, title, artworkURL, type: String
        let year: Int
        let genres: [String]
        let watched: Bool
        let dateAdded: Date
    }

    private struct ListDTO: Codable {
        let id, name: String
        let itemIDs: [String]
    }

    private struct Payload: Codable {
        var items: [ItemDTO]
        var lists: [ListDTO]
    }

    private static var fileURL: URL {
        let dir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        return dir.appendingPathComponent("sim-dev-store.json")
    }

    /// Set when an existing store file could not be read or decoded. While true,
    /// `save` refuses to write, so a corrupt file is never overwritten with the
    /// empty state that `load` had to fall back to.
    private(set) static var isReadFailed = false

    static func load() -> (items: [LibraryItem], lists: [Watchlist]) {
        guard let data = try? Data(contentsOf: fileURL) else {
            // No file yet: a genuinely empty store. Writing is safe.
            isReadFailed = false
            return ([], [])
        }
        guard let payload = try? JSONDecoder().decode(Payload.self, from: data) else {
            // The file exists but is unreadable. Returning empty here would let
            // the objectWillChange observers persist that emptiness over the
            // user's real data, so block writes until a successful load.
            isReadFailed = true
            print("SimDevStore: could not decode \(fileURL.lastPathComponent); writes disabled to avoid data loss.")
            return ([], [])
        }
        isReadFailed = false
        let items = payload.items.compactMap { dto -> LibraryItem? in
            guard let type = MediaType(rawValue: dto.type) else { return nil }
            return LibraryItem(id: dto.id, catalogID: dto.catalogID, iTunesID: dto.iTunesID,
                               title: dto.title, year: dto.year, type: type,
                               artworkURL: dto.artworkURL, genres: dto.genres,
                               watched: dto.watched, dateAdded: dto.dateAdded)
        }
        let lists = payload.lists.map { Watchlist(id: $0.id, name: $0.name, itemIDs: $0.itemIDs) }
        return (items, lists)
    }

    static func save(items: [LibraryItem], lists: [Watchlist]) {
        // A failed load leaves the view models empty. Persisting that would
        // destroy the very data the failed read could not parse.
        guard !isReadFailed else { return }

        let payload = Payload(
            items: items.map {
                ItemDTO(id: $0.id, catalogID: $0.catalogID, iTunesID: $0.iTunesID,
                        title: $0.title, artworkURL: $0.artworkURL, type: $0.type.rawValue,
                        year: $0.year, genres: $0.genres, watched: $0.watched,
                        dateAdded: $0.dateAdded)
            },
            lists: lists.map { ListDTO(id: $0.id, name: $0.name, itemIDs: $0.itemIDs) }
        )
        guard let data = try? JSONEncoder().encode(payload) else { return }
        try? data.write(to: fileURL, options: .atomic)
    }
}
#endif
