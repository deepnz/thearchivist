import Foundation

/// Title discovery.
///
/// This exists because the iTunes Search API stopped returning catalogue video.
/// Searching it for "Good Will Hunting" or "Spirited Away" yields nothing even
/// at limit=200, while iTunes Lookup finds the same films instantly by ID — the
/// titles are in the store but absent from the search index. Television is
/// worse than absent: "Game of Thrones" returns season 8 and the complete-series
/// bundle, never seasons 1-7, and `offset` is ignored so there is no way to page
/// to them.
///
/// CheapCharts indexes the same storefronts and returns the iTunes store ID, so
/// it stands in for the discovery step only. `iTunesLookupService` still
/// supplies every field the library stores. Their API is documented for this
/// use at https://www.cheapcharts.com/llms.txt ("This API is free to use and
/// specifically designed for AI agents, LLMs, and automated tools").
enum CheapChartsService {

    private static let base = "https://buster.cheapcharts.de/v1/gptapi/Search.php"

    /// The documented cap is 20; asking for more is silently clamped.
    private static let resultLimit = 20

    /// A search hit, carrying only what is needed to look the title up.
    struct Candidate: Equatable {
        let storeID: String
        let title: String
        let year: Int?
        let type: MediaType
    }

    static func searchURL(query: String, itemType: String = "all") -> URL? {
        var components = URLComponents(string: base)
        components?.queryItems = [
            URLQueryItem(name: "action", value: "search"),
            URLQueryItem(name: "store", value: "itunes"),
            URLQueryItem(name: "country", value: "us"),
            // "all" spans movies and seasons. The narrower "movies"/"seasons"
            // values work too, but a single call covering both keeps one
            // request per search.
            URLQueryItem(name: "itemType", value: itemType),
            URLQueryItem(name: "query", value: query),
            URLQueryItem(name: "limit", value: String(resultLimit)),
        ]
        return components?.url
    }

    static func search(query: String) async throws -> [Candidate] {
        guard let url = searchURL(query: query) else { throw URLError(.badURL) }
        let (data, _) = try await URLSession.shared.data(from: url)
        return try parse(data)
    }

    /// Decodes a search response into candidates, discarding anything that is
    /// not a film or TV season with a usable store ID.
    static func parse(_ data: Data) throws -> [Candidate] {
        let response = try JSONDecoder().decode(CheapChartsSearchResponse.self, from: data)
        guard response.status == "success" else { return [] }
        return response.items.compactMap(Candidate.init(item:))
    }
}

// MARK: - Wire format

/// Search returns a flat `results` array, while the other CheapCharts endpoints
/// nest arrays under keys like `results.buymovies`. Both shapes are accepted so
/// a change in the response envelope degrades to fewer results rather than a
/// thrown error mid-search.
struct CheapChartsSearchResponse: Decodable {
    let status: String
    let items: [CheapChartsItem]

    private enum CodingKeys: String, CodingKey { case status, results }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        status = try c.decodeIfPresent(String.self, forKey: .status) ?? "error"

        if let flat = try? c.decode([CheapChartsItem].self, forKey: .results) {
            items = flat
        } else if let nested = try? c.decode([String: [CheapChartsItem]].self, forKey: .results) {
            items = nested.values.flatMap { $0 }
        } else {
            items = []
        }
    }
}

struct CheapChartsItem: Decodable {
    let title: String?
    let mediaType: String?
    let releaseYear: String?
    let idInStore: String?
    let productPageURL: String?

    private enum CodingKeys: String, CodingKey {
        case title, mediaType, releaseYear
        case idInStore
        case productPageURL = "cheapChartsProductPageUrl"
    }

    /// The store ID arrives in `idInStore` on every response observed, but that
    /// field is absent from the published field table, so the product page URL
    /// — which is documented, and ends in the same ID — is used as a fallback.
    var storeID: String? {
        if let direct = idInStore, !direct.isEmpty { return direct }
        guard let url = productPageURL,
              let last = url.split(separator: "?").first?.split(separator: "/").last,
              last.allSatisfy(\.isNumber), !last.isEmpty
        else { return nil }
        return String(last)
    }
}

private extension CheapChartsService.Candidate {
    /// Fails for anything that is not purchasable video: search with
    /// `itemType=all` also returns ebooks, audiobooks and albums.
    init?(item: CheapChartsItem) {
        guard let storeID = item.storeID,
              let title = item.title, !title.isEmpty,
              let type = MediaType(cheapChartsMediaType: item.mediaType)
        else { return nil }

        self.storeID = storeID
        self.title = title
        self.year = item.releaseYear.flatMap(Int.init)
        self.type = type
    }
}

private extension MediaType {
    init?(cheapChartsMediaType raw: String?) {
        switch raw {
        case "movies": self = .film
        case "seasons": self = .series
        default: return nil
        }
    }
}
