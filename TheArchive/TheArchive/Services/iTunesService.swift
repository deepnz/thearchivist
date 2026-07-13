import Foundation

enum iTunesService {
    private static let base = "https://itunes.apple.com/search"

    /// The user's App Store storefront country (ISO 3166-1 alpha-2, lowercased).
    /// Searching the right storefront ensures result IDs and store URLs
    /// resolve in the user's own Apple TV app.
    static var storefrontCountry: String {
        Locale.current.region?.identifier.lowercased() ?? "us"
    }

    static func searchURL(query: String, country: String = iTunesService.storefrontCountry) -> URL? {
        var components = URLComponents(string: base)
        // media=all with entity=movie,tvSeason returns both films and TV collections.
        // Do NOT use media=movie here — it suppresses TV results.
        components?.queryItems = [
            URLQueryItem(name: "term", value: query),
            URLQueryItem(name: "media", value: "all"),
            URLQueryItem(name: "entity", value: "movie,tvSeason"),
            URLQueryItem(name: "country", value: country),
            URLQueryItem(name: "limit", value: "25"),
        ]
        return components?.url
    }

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
