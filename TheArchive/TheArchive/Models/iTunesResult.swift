import Foundation

struct iTunesSearchResponse: Decodable {
    let results: [iTunesResult]
}

struct iTunesResult: Identifiable, Decodable {
    let id: String           // derived from trackId or collectionId
    let title: String
    let year: Int
    let type: MediaType
    let artworkURL: String   // 600x900bb substituted

    /// Year as a bare 4-digit string, for use in `Text`.
    /// See `LibraryItem.yearText` for why this is needed.
    var yearText: String { String(year) }

    private enum CodingKeys: String, CodingKey {
        case trackId, collectionId, trackName, collectionName
        case releaseDate, wrapperType, kind
        case artworkUrl100
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)

        let kind = try c.decodeIfPresent(String.self, forKey: .kind) ?? ""

        // Determine type
        if kind == "feature-movie" {
            type = .film
            let trackId = try c.decode(Int.self, forKey: .trackId)
            id = "\(trackId)"
            title = try c.decode(String.self, forKey: .trackName)
        } else {
            // TV collection
            type = .series
            let collectionId = try c.decode(Int.self, forKey: .collectionId)
            id = "\(collectionId)"
            title = try c.decodeIfPresent(String.self, forKey: .collectionName)
                    ?? (try c.decode(String.self, forKey: .trackName))
        }

        // Year from releaseDate
        let releaseDateString = try c.decodeIfPresent(String.self, forKey: .releaseDate) ?? ""
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        let date = formatter.date(from: releaseDateString)
        let calendar = Calendar.current
        year = date.map { calendar.component(.year, from: $0) } ?? 0

        // Artwork — substitute size token
        let rawArtwork = try c.decodeIfPresent(String.self, forKey: .artworkUrl100) ?? ""
        artworkURL = rawArtwork
            .replacingOccurrences(of: "100x100bb", with: "600x900bb")
            .replacingOccurrences(of: "100x100", with: "600x900")
    }
}
