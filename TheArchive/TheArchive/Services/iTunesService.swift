import Foundation

/// The iTunes Search endpoint.
///
/// Kept for the URL builder alone. Search is no longer used to find titles:
/// as of September 2026 it stopped returning catalogue video, so discovery
/// goes through `CheapChartsService` and metadata through
/// `iTunesLookupService`. The builder remains so the failure is easy to
/// re-test against a live endpoint if Apple restores the index.
enum iTunesService {
    private static let base = "https://itunes.apple.com/search"

    static func searchURL(query: String) -> URL? {
        var components = URLComponents(string: base)
        // media=all with entity=movie,tvSeason returns both films and TV
        // collections. Do NOT use media=movie here — it suppresses TV results.
        components?.queryItems = [
            URLQueryItem(name: "term", value: query),
            URLQueryItem(name: "media", value: "all"),
            URLQueryItem(name: "entity", value: "movie,tvSeason"),
            URLQueryItem(name: "limit", value: "25"),
        ]
        return components?.url
    }

    /// Searches the iTunes catalogue directly.
    ///
    /// Unused by the app. Retained as the reproduction case for the index gap:
    /// a term whose film exists in the store ("Good Will Hunting", id
    /// 1520266716, which `iTunesLookupService` resolves) returns nothing here.
    static func search(query: String) async throws -> [iTunesResult] {
        guard let url = searchURL(query: query) else {
            throw URLError(.badURL)
        }
        let (data, _) = try await URLSession.shared.data(from: url)
        let response = try JSONDecoder().decode(iTunesSearchResponse.self, from: data)

        // Deduplicate by id (iTunes may return both movie and tvSeason for same title)
        var seen = Set<String>()
        return response.results.filter { seen.insert($0.id).inserted }
    }
}
