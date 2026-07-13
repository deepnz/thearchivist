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

    func search() async {
        guard !query.trimmingCharacters(in: .whitespaces).isEmpty else { return }
        isSearching = true
        errorMessage = nil
        do {
            let raw = try await iTunesService.search(query: query)
            results = raw
            if results.isEmpty { errorMessage = "No results for \"\(query)\"" }
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
