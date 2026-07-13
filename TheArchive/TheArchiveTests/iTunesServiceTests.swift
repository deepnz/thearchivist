import XCTest
@testable import TheArchive

final class iTunesServiceTests: XCTestCase {

    func test_searchURL_films() {
        let url = iTunesService.searchURL(query: "Inception", country: "us")
        XCTAssertNotNil(url)
        let str = url!.absoluteString
        XCTAssertTrue(str.contains("term=Inception"))
        XCTAssertTrue(str.contains("media=all"))
        XCTAssertTrue(str.contains("entity=movie,tvSeason"))
        XCTAssertTrue(str.contains("country=us"))
    }

    func test_searchURL_usesGivenStorefrontCountry() {
        let url = iTunesService.searchURL(query: "Inception", country: "gb")
        XCTAssertTrue(url!.absoluteString.contains("country=gb"))
    }

    func test_searchURL_encodes_spaces() {
        let url = iTunesService.searchURL(query: "The Dark Knight")
        XCTAssertNotNil(url)
        XCTAssertFalse(url!.absoluteString.contains(" "))
    }

    func test_parseResponse_decodesFilm() throws {
        let json = """
        {"results": [{
          "wrapperType": "track",
          "kind": "feature-movie",
          "trackId": 999,
          "trackName": "Inception",
          "releaseDate": "2010-07-16T07:00:00Z",
          "artworkUrl100": "https://example.com/100x100bb.jpg",
          "trackViewUrl": "https://itunes.apple.com/us/movie/inception/id999?uo=4"
        }]}
        """.data(using: .utf8)!

        let response = try JSONDecoder().decode(iTunesSearchResponse.self, from: json)
        XCTAssertEqual(response.results.count, 1)
        let film = response.results[0]
        XCTAssertEqual(film.title, "Inception")
        XCTAssertEqual(film.id, "999")
        XCTAssertEqual(film.type, .film)
        XCTAssertEqual(film.year, 2010)
        XCTAssertTrue(film.artworkURL.contains("600x900bb"))
        XCTAssertEqual(film.storeURL, "https://itunes.apple.com/us/movie/inception/id999?uo=4")
    }

    func test_parseResponse_decodesTVSeason_usesCollectionViewUrl() throws {
        let json = """
        {"results": [{
          "wrapperType": "collection",
          "collectionType": "TV Season",
          "collectionId": 555,
          "collectionName": "Breaking Bad, Season 1",
          "releaseDate": "2008-01-20T08:00:00Z",
          "artworkUrl100": "https://example.com/100x100bb.jpg",
          "collectionViewUrl": "https://itunes.apple.com/us/tv-season/breaking-bad-season-1/id555?uo=4"
        }]}
        """.data(using: .utf8)!

        let response = try JSONDecoder().decode(iTunesSearchResponse.self, from: json)
        let show = response.results[0]
        XCTAssertEqual(show.type, .series)
        XCTAssertEqual(show.id, "555")
        XCTAssertEqual(show.title, "Breaking Bad, Season 1")
        XCTAssertEqual(show.year, 2008)
        XCTAssertEqual(show.storeURL, "https://itunes.apple.com/us/tv-season/breaking-bad-season-1/id555?uo=4")
    }

    func test_parseResponse_missingStoreURL_defaultsEmpty() throws {
        let json = """
        {"results": [{
          "kind": "feature-movie",
          "trackId": 1,
          "trackName": "Test"
        }]}
        """.data(using: .utf8)!

        let response = try JSONDecoder().decode(iTunesSearchResponse.self, from: json)
        XCTAssertEqual(response.results[0].storeURL, "")
        XCTAssertEqual(response.results[0].year, 0)
    }
}
