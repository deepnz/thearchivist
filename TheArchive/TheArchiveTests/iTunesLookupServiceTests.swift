import XCTest
@testable import TheArchive

final class iTunesLookupServiceTests: XCTestCase {

    // MARK: - URL

    func test_lookupURL_batchesIDs() {
        let url = iTunesLookupService.lookupURL(ids: ["1", "2", "3"])
        XCTAssertNotNil(url)
        XCTAssertTrue(url!.absoluteString.contains("id=1,2,3"))
        XCTAssertTrue(url!.absoluteString.contains("country=US"))
    }

    func test_lookupURL_nilForEmptyIDs() {
        XCTAssertNil(iTunesLookupService.lookupURL(ids: []))
    }

    // MARK: - Decoding the shape Apple actually returns

    /// A film's record carries a trackId AND a collectionId — the latter being
    /// a bundle it is sold in. Keying on the collection would store the bundle's
    /// ID and deep-link to the wrong page.
    func test_parse_filmKeysOnTrackIDNotItsBundle() throws {
        let json = """
        {"results":[{
          "wrapperType":"track","kind":"feature-movie","collectionType":null,
          "trackId":1520266716,"collectionId":1757914022,
          "trackName":"Good Will Hunting","collectionName":"Iconic Films of the 1990's",
          "releaseDate":"1997-12-05T08:00:00Z","primaryGenreName":"Drama",
          "artworkUrl100":"https://example.com/100x100bb.jpg"
        }]}
        """.data(using: .utf8)!

        let results = try iTunesLookupService.parse(json)
        XCTAssertEqual(results.count, 1)
        XCTAssertEqual(results[0].id, "1520266716")
        XCTAssertEqual(results[0].title, "Good Will Hunting")
        XCTAssertEqual(results[0].type, .film)
        XCTAssertEqual(results[0].year, 1997)
        XCTAssertEqual(results[0].genre, "Drama")
    }

    /// Apple now returns kind=null on video records. The previous rule —
    /// anything that is not "feature-movie" is a series — classified every
    /// film as a series once that happened.
    func test_parse_filmWithNullKindIsStillAFilm() throws {
        let json = """
        {"results":[{
          "wrapperType":"track","kind":null,"collectionType":null,
          "trackId":545892907,"trackName":"Titanic",
          "releaseDate":"1997-12-19T08:00:00Z","primaryGenreName":"Drama",
          "artworkUrl100":"https://example.com/100x100bb.jpg"
        }]}
        """.data(using: .utf8)!

        let results = try iTunesLookupService.parse(json)
        XCTAssertEqual(results[0].type, .film)
        XCTAssertEqual(results[0].id, "545892907")
    }

    func test_parse_seasonIdentifiedByCollectionType() throws {
        let json = """
        {"results":[{
          "wrapperType":"collection","kind":null,"collectionType":"TV Season",
          "trackId":null,"collectionId":482730236,
          "trackName":null,"collectionName":"Game of Thrones, Season 1",
          "releaseDate":"2011-12-06T08:00:00Z","primaryGenreName":"Sci-Fi & Fantasy",
          "artworkUrl100":"https://example.com/100x100bb.jpg"
        }]}
        """.data(using: .utf8)!

        let results = try iTunesLookupService.parse(json)
        XCTAssertEqual(results[0].type, .series)
        XCTAssertEqual(results[0].id, "482730236")
        XCTAssertEqual(results[0].title, "Game of Thrones, Season 1")
    }

    /// A complete-series or film bundle: a collection that is not a TV season.
    func test_parse_bundleTreatedAsSeries() throws {
        let json = """
        {"results":[{
          "wrapperType":"collection","kind":null,"collectionType":null,
          "collectionId":1458816208,
          "collectionName":"Game of Thrones, The Complete Series",
          "releaseDate":"2019-05-19T07:00:00Z",
          "artworkUrl100":"https://example.com/100x100bb.jpg"
        }]}
        """.data(using: .utf8)!

        let results = try iTunesLookupService.parse(json)
        XCTAssertEqual(results[0].type, .series)
        XCTAssertEqual(results[0].id, "1458816208")
    }

    func test_parse_artworkUpgradedToPosterSize() throws {
        let json = """
        {"results":[{
          "kind":"feature-movie","trackId":1,"trackName":"X",
          "releaseDate":"2000-01-01T00:00:00Z",
          "artworkUrl100":"https://example.com/a/100x100bb.jpg"
        }]}
        """.data(using: .utf8)!
        XCTAssertTrue(try iTunesLookupService.parse(json)[0].artworkURL.contains("600x900bb"))
    }

    /// Lookup returns `{"resultCount":0,"results":[]}` for an unknown ID.
    func test_parse_emptyResults() throws {
        let json = #"{"resultCount":0,"results":[]}"#.data(using: .utf8)!
        XCTAssertTrue(try iTunesLookupService.parse(json).isEmpty)
    }
}
