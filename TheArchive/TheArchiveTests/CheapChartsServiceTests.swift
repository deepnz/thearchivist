import XCTest
@testable import TheArchive

final class CheapChartsServiceTests: XCTestCase {

    // MARK: - URL

    func test_searchURL_carriesRequiredParameters() {
        let url = CheapChartsService.searchURL(query: "Good Will Hunting")
        XCTAssertNotNil(url)
        let str = url!.absoluteString
        XCTAssertTrue(str.contains("action=search"))
        XCTAssertTrue(str.contains("store=itunes"))
        XCTAssertTrue(str.contains("country=us"))
        XCTAssertTrue(str.contains("itemType=all"))
        XCTAssertFalse(str.contains(" "), "spaces must be percent-encoded")
    }

    // MARK: - Decoding

    /// Shape captured from a live response.
    func test_parse_decodesFilmAndSeason() throws {
        let json = """
        {"status":"success","results":[
          {"title":"Good Will Hunting","mediaType":"movies","releaseYear":"1997",
           "idInStore":"1520266716",
           "cheapChartsProductPageUrl":"https://www.cheapcharts.com/us/itunes/movies/1520266716?utm_source=api"},
          {"title":"Game of Thrones, Season 1","mediaType":"seasons","releaseYear":"2011",
           "idInStore":"482730236",
           "cheapChartsProductPageUrl":"https://www.cheapcharts.com/us/itunes/seasons/482730236?utm_source=api"}
        ]}
        """.data(using: .utf8)!

        let candidates = try CheapChartsService.parse(json)
        XCTAssertEqual(candidates.count, 2)
        XCTAssertEqual(candidates[0], .init(storeID: "1520266716",
                                            title: "Good Will Hunting",
                                            year: 1997, type: .film))
        XCTAssertEqual(candidates[1].type, .series)
        XCTAssertEqual(candidates[1].storeID, "482730236")
    }

    /// itemType=all also returns ebooks, audiobooks and albums.
    func test_parse_dropsNonVideoMediaTypes() throws {
        let json = """
        {"status":"success","results":[
          {"title":"Severance","mediaType":"ebooks","releaseYear":"2018","idInStore":"1333495247"},
          {"title":"Severance","mediaType":"albums","releaseYear":"2022","idInStore":"1111111111"},
          {"title":"Severance","mediaType":"movies","releaseYear":"2007","idInStore":"293368106"}
        ]}
        """.data(using: .utf8)!

        let candidates = try CheapChartsService.parse(json)
        XCTAssertEqual(candidates.count, 1)
        XCTAssertEqual(candidates[0].type, .film)
    }

    /// `idInStore` is absent from the published field table, so the documented
    /// product page URL has to carry the fallback.
    func test_parse_fallsBackToProductPageURLForStoreID() throws {
        let json = """
        {"status":"success","results":[
          {"title":"Akira","mediaType":"movies","releaseYear":"1988",
           "cheapChartsProductPageUrl":"https://www.cheapcharts.com/us/itunes/movies/1808721523?utm_source=api"}
        ]}
        """.data(using: .utf8)!

        let candidates = try CheapChartsService.parse(json)
        XCTAssertEqual(candidates.first?.storeID, "1808721523")
    }

    func test_parse_acceptsNestedResultsEnvelope() throws {
        let json = """
        {"status":"success","results":{"buymovies":[
          {"title":"Titanic","mediaType":"movies","releaseYear":"1997","idInStore":"545892907"}
        ]}}
        """.data(using: .utf8)!

        XCTAssertEqual(try CheapChartsService.parse(json).first?.storeID, "545892907")
    }

    func test_parse_returnsEmptyOnErrorStatus() throws {
        let json = """
        {"status":"error","message":"itemType invalid"}
        """.data(using: .utf8)!
        XCTAssertTrue(try CheapChartsService.parse(json).isEmpty)
    }

    func test_parse_skipsRecordWithoutUsableStoreID() throws {
        let json = """
        {"status":"success","results":[
          {"title":"No ID Here","mediaType":"movies","releaseYear":"2020"}
        ]}
        """.data(using: .utf8)!
        XCTAssertTrue(try CheapChartsService.parse(json).isEmpty)
    }
}
