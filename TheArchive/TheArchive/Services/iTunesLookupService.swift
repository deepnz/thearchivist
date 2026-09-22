import Foundation

/// Resolves iTunes store IDs to the fields the library stores.
///
/// Lookup is unaffected by the search-index gaps that made `CheapChartsService`
/// necessary: every ID that service returns resolves here, with canonical title,
/// artwork and genre. Keeping Apple as the source of the stored metadata means
/// the deep link, the artwork and the title all agree with the store the user
/// is sent to.
enum iTunesLookupService {

    private static let base = "https://itunes.apple.com/lookup"

    /// Lookup accepts a comma-separated id list, so a page of search results
    /// costs one request rather than one per title.
    private static let batchSize = 20

    /// `country` must match the storefront the IDs came from. A US ID returns
    /// nothing from a German lookup and vice versa.
    static func lookupURL(ids: [String], country: String = Storefront.current) -> URL? {
        guard !ids.isEmpty else { return nil }
        var components = URLComponents(string: base)
        components?.queryItems = [
            URLQueryItem(name: "id", value: ids.joined(separator: ",")),
            URLQueryItem(name: "country", value: country.uppercased()),
        ]
        return components?.url
    }

    /// Looks up every ID and returns the resolved titles, ordered to match
    /// `ids`. IDs that do not resolve are dropped rather than surfaced as
    /// placeholders: a row with no artwork or year is worse than no row.
    static func lookup(ids: [String]) async throws -> [iTunesResult] {
        guard !ids.isEmpty else { return [] }

        var resolved: [String: iTunesResult] = [:]
        for batch in stride(from: 0, to: ids.count, by: batchSize).map({
            Array(ids[$0..<min($0 + batchSize, ids.count)])
        }) {
            guard let url = lookupURL(ids: batch) else { continue }
            let (data, _) = try await URLSession.shared.data(from: url)
            for result in try parse(data) {
                resolved[result.id] = result
            }
        }

        return ids.compactMap { resolved[$0] }
    }

    static func parse(_ data: Data) throws -> [iTunesResult] {
        try JSONDecoder().decode(iTunesSearchResponse.self, from: data).results
    }
}
