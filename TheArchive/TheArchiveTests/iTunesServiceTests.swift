import XCTest
@testable import TheArchive

final class iTunesServiceTests: XCTestCase {

    func test_searchURL_films() {
        let url = iTunesService.searchURL(query: "Inception")
        XCTAssertNotNil(url)
        let str = url!.absoluteString
        XCTAssertTrue(str.contains("term=Inception"))
        XCTAssertTrue(str.contains("media=movie") || str.contains("media=all"))
    }

    func test_searchURL_encodes_spaces() {
        let url = iTunesService.searchURL(query: "The Dark Knight")
        XCTAssertNotNil(url)
        XCTAssertFalse(url!.absoluteString.contains(" "))
    }

    /// The app no longer searches this endpoint — see `CheapChartsServiceTests`
    /// and `iTunesLookupServiceTests` for the path that is live. This case
    /// stays because the response shape is shared with Lookup.
    func test_parseResponse_decodesFilm() throws {
        let json = """
        {"results": [{
          "wrapperType": "track",
          "kind": "feature-movie",
          "trackId": 999,
          "trackName": "Inception",
          "releaseDate": "2010-07-16T07:00:00Z",
          "artworkUrl100": "https://example.com/100x100bb.jpg"
        }]}
        """.data(using: .utf8)!

        let response = try JSONDecoder().decode(iTunesSearchResponse.self, from: json)
        XCTAssertEqual(response.results.count, 1)
        XCTAssertEqual(response.results[0].title, "Inception")
        XCTAssertEqual(response.results[0].id, "999")
        XCTAssertEqual(response.results[0].type, .film)
        XCTAssertEqual(response.results[0].year, 2010)
        XCTAssertTrue(response.results[0].artworkURL.contains("600x900bb"))
    }
}
