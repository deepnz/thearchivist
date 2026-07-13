import Foundation
import Combine

@MainActor
final class WatchlistViewModel: ObservableObject {
    @Published var watchlists: [Watchlist] = []
    @Published var selectedListID: String? = nil

    var selectedList: Watchlist? {
        watchlists.first { $0.id == selectedListID }
    }
}
