import Foundation
import Combine
import Network

enum TypeFilter { case all, film, series }
enum SortOrder { case az, za, yearNewest, yearOldest, newestAdded }

@MainActor
final class LibraryViewModel: ObservableObject {
    @Published var items: [LibraryItem] = []
    @Published var typeFilter: TypeFilter = .all
    @Published var selectedGenre: String? = nil
    @Published var searchQuery: String = ""
    @Published var sortOrder: SortOrder = .az
    @Published var isLoading: Bool = false
    @Published var isOffline: Bool = false

    /// Set when the CloudKit fetch fails. Without this an error renders as the
    /// empty-library message, which tells users their library is empty when it
    /// actually failed to load and invites them to re-add titles they own.
    @Published var loadError: String? = nil

    private let monitor = NWPathMonitor()
    private let monitorQueue = DispatchQueue(label: "archive.network")

    var filteredItems: [LibraryItem] {
        let filtered = Self.filter(items, type: typeFilter, genre: selectedGenre, query: searchQuery)
        return Self.sort(filtered, by: sortOrder)
    }

    var computedGenrePills: [String] {
        let baseItems = Self.filter(items, type: typeFilter, genre: nil, query: "")
        return Self.genrePills(from: baseItems)
    }

    func startMonitoring() {
        monitor.pathUpdateHandler = { [weak self] path in
            DispatchQueue.main.async {
                self?.isOffline = path.status != .satisfied
            }
        }
        monitor.start(queue: monitorQueue)
    }

    // MARK: - Static pure functions (testable without @MainActor)

    nonisolated static func filter(_ items: [LibraryItem], type: TypeFilter, genre: String?, query: String) -> [LibraryItem] {
        items.filter { item in
            let matchesType: Bool = {
                switch type {
                case .all: return true
                case .film: return item.type == .film
                case .series: return item.type == .series
                }
            }()
            let matchesGenre = genre == nil || item.genres.contains(genre!)
            let matchesQuery = query.isEmpty || item.title.localizedCaseInsensitiveContains(query)
            return matchesType && matchesGenre && matchesQuery
        }
    }

    nonisolated static func sort(_ items: [LibraryItem], by order: SortOrder) -> [LibraryItem] {
        switch order {
        case .az:          return items.sorted { $0.title.localizedCompare($1.title) == .orderedAscending }
        case .za:          return items.sorted { $0.title.localizedCompare($1.title) == .orderedDescending }
        case .yearNewest:  return items.sorted { $0.year > $1.year }
        case .yearOldest:  return items.sorted { $0.year < $1.year }
        case .newestAdded: return items.sorted { $0.dateAdded > $1.dateAdded }
        }
    }

    nonisolated static func genrePills(from items: [LibraryItem]) -> [String] {
        Array(Set(items.flatMap(\.genres))).sorted()
    }
}
