import Foundation
import Combine

@MainActor
final class SearchViewModel: ObservableObject {
    @Published var query: String = ""
    @Published var results: [iTunesResult] = []
    @Published var isSearching: Bool = false
    @Published var errorMessage: String? = nil

    nonisolated static func isDuplicate(iTunesID: String, existingIDs: Set<String>) -> Bool {
        existingIDs.contains(iTunesID)
    }

    /// Orders candidates so the title the user typed comes first.
    ///
    /// CheapCharts matches on individual words, so "batman beyond" also returns
    /// "Beyond Paradise" and "Beyond the Bolex". Ranking rather than filtering
    /// keeps the loose matches reachable — a search for a half-remembered title
    /// should still show something — while putting exact matches at the top.
    /// Seasons of one show keep their natural order, so "Game of Thrones"
    /// lists season 1 before season 8.
    nonisolated static func rank(
        _ candidates: [CheapChartsService.Candidate],
        for query: String
    ) -> [CheapChartsService.Candidate] {
        func normalise(_ s: String) -> String {
            s.lowercased().filter { $0.isLetter || $0.isNumber }
        }

        let target = normalise(query)

        func tier(_ c: CheapChartsService.Candidate) -> Int {
            let title = normalise(c.title)
            if title == target { return 0 }
            // A season's title carries its number ("Game of Thrones, Season 1"),
            // so an exact show match is a prefix rather than a whole match.
            if title.hasPrefix(target) { return 1 }
            if title.contains(target) { return 2 }
            return 3
        }

        /// Season number, for a title ending in one. Without this "Batman
        /// Beyond" leads with "Return of the Joker" — both are prefix matches,
        /// and CheapCharts returns season 3 ahead of season 1.
        func seasonNumber(_ c: CheapChartsService.Candidate) -> Int? {
            guard c.type == .series,
                  let range = c.title.range(of: #"(?i)season\s+(\d+)"#, options: .regularExpression)
            else { return nil }
            return Int(c.title[range].filter(\.isNumber))
        }

        return candidates.enumerated()
            .sorted { lhs, rhs in
                let (lt, rt) = (tier(lhs.element), tier(rhs.element))
                if lt != rt { return lt < rt }

                // Numbered seasons of the same show read in order, ahead of
                // anything in the tier that is not a numbered season.
                switch (seasonNumber(lhs.element), seasonNumber(rhs.element)) {
                case let (l?, r?) where l != r: return l < r
                case (.some, .none): return true
                case (.none, .some): return false
                default: break
                }

                // Otherwise preserve CheapCharts' own relevance order.
                return lhs.offset < rhs.offset
            }
            .map(\.element)
    }

    /// Searches in two stages: CheapCharts finds the titles and their iTunes
    /// store IDs, then iTunes Lookup supplies the metadata that gets stored.
    ///
    /// The single-call iTunes Search path this replaces no longer returns
    /// catalogue video — see `CheapChartsService` for what it does return.
    /// Lookup is still Apple's, so the stored artwork, title and deep link
    /// continue to agree with the store.
    func search(existingIDs: Set<String>) async {
        let trimmed = query.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return }
        isSearching = true
        errorMessage = nil
        do {
            let candidates = try await CheapChartsService.search(query: trimmed)
            let ranked = Self.rank(candidates, for: trimmed)

            if ranked.isEmpty {
                results = []
                errorMessage = "No results for \"\(trimmed)\""
            } else {
                results = try await iTunesLookupService.lookup(ids: ranked.map(\.storeID))
                if results.isEmpty { errorMessage = "No results for \"\(trimmed)\"" }
            }
        } catch let error as URLError where error.code == .notConnectedToInternet {
            errorMessage = "No connection — check your network and try again"
            results = []
        } catch {
            errorMessage = "Search unavailable — try again in a moment"
            results = []
        }
        isSearching = false
    }
}
