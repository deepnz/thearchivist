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

    /// Apple's own genre for the title, when the record carries one. Offered as
    /// the starting tag on add; the user is free to change it.
    let genre: String?

    /// Year as a bare 4-digit string, for use in `Text`.
    /// See `LibraryItem.yearText` for why this is needed.
    var yearText: String { String(year) }

    private enum CodingKeys: String, CodingKey {
        case trackId, collectionId, trackName, collectionName
        case releaseDate, wrapperType, kind, collectionType
        case artworkUrl100, primaryGenreName
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)

        let kind = try c.decodeIfPresent(String.self, forKey: .kind) ?? ""
        let collectionType = try c.decodeIfPresent(String.self, forKey: .collectionType) ?? ""
        let trackId = try c.decodeIfPresent(Int.self, forKey: .trackId)
        let collectionId = try c.decodeIfPresent(Int.self, forKey: .collectionId)
        let trackName = try c.decodeIfPresent(String.self, forKey: .trackName)
        let collectionName = try c.decodeIfPresent(String.self, forKey: .collectionName)

        // A season is identified by collectionType, not by the absence of
        // `kind`. Apple now returns kind=null on video records, so the former
        // "anything that is not feature-movie is a series" rule classified
        // every film as a series. Order matters: a film's record carries BOTH a
        // trackId (the film) and a collectionId (a bundle it is sold in, e.g.
        // "Iconic Films of the 1990's"), so a season must be ruled out first
        // and the film must key on trackId.
        if collectionType == "TV Season" {
            type = .series
            guard let collectionId else {
                throw DecodingError.dataCorruptedError(
                    forKey: .collectionId, in: c,
                    debugDescription: "TV Season without a collectionId")
            }
            id = "\(collectionId)"
            title = collectionName ?? trackName ?? ""
        } else if kind == "feature-movie" || trackId != nil {
            type = .film
            guard let trackId else {
                throw DecodingError.dataCorruptedError(
                    forKey: .trackId, in: c,
                    debugDescription: "Film without a trackId")
            }
            id = "\(trackId)"
            title = trackName ?? collectionName ?? ""
        } else if let collectionId {
            // A collection that is not flagged as a TV season: a film bundle or
            // a complete-series listing. Both behave as a series here, being
            // several works under one store ID.
            type = .series
            id = "\(collectionId)"
            title = collectionName ?? trackName ?? ""
        } else {
            throw DecodingError.dataCorruptedError(
                forKey: .trackId, in: c,
                debugDescription: "Record has neither a trackId nor a collectionId")
        }

        guard !title.isEmpty else {
            throw DecodingError.dataCorruptedError(
                forKey: .trackName, in: c, debugDescription: "Record has no title")
        }

        // Year from releaseDate
        let releaseDateString = try c.decodeIfPresent(String.self, forKey: .releaseDate) ?? ""
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        let date = formatter.date(from: releaseDateString)
        let calendar = Calendar.current
        year = date.map { calendar.component(.year, from: $0) } ?? 0

        genre = try c.decodeIfPresent(String.self, forKey: .primaryGenreName)

        // Artwork — substitute size token
        let rawArtwork = try c.decodeIfPresent(String.self, forKey: .artworkUrl100) ?? ""
        artworkURL = rawArtwork
            .replacingOccurrences(of: "100x100bb", with: "600x900bb")
            .replacingOccurrences(of: "100x100", with: "600x900")
    }
}
