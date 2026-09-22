import XCTest
@testable import TheArchive

final class SearchViewModelTests: XCTestCase {

    func test_isDuplicate_true() {
        let existing: Set<String> = ["111", "222"]
        XCTAssertTrue(SearchViewModel.isDuplicate(iTunesID: "111", existingIDs: existing))
    }

    func test_isDuplicate_false() {
        let existing: Set<String> = ["111", "222"]
        XCTAssertFalse(SearchViewModel.isDuplicate(iTunesID: "333", existingIDs: existing))
    }
}

// MARK: - Ranking CheapCharts candidates

extension SearchViewModelTests {

    private func candidate(_ title: String, _ id: String,
                           _ type: MediaType = .film) -> CheapChartsService.Candidate {
        .init(storeID: id, title: title, year: nil, type: type)
    }

    /// CheapCharts matches on individual words, so an exact title can arrive
    /// below unrelated ones.
    func test_rank_putsExactTitleFirst() {
        let ranked = SearchViewModel.rank([
            candidate("Beyond Paradise", "1"),
            candidate("Beyond the Bolex", "2"),
            candidate("Batman Beyond", "3"),
        ], for: "batman beyond")

        XCTAssertEqual(ranked.first?.storeID, "3")
    }

    /// A season's title carries its number, so an exact show match is a prefix.
    func test_rank_prefersSeasonsOfTheSearchedShow() {
        let ranked = SearchViewModel.rank([
            candidate("The Game of Love", "9", .series),
            candidate("Game of Thrones, Season 1", "1", .series),
            candidate("Game of Thrones, Season 2", "2", .series),
        ], for: "game of thrones")

        XCTAssertEqual(ranked.prefix(2).map(\.storeID), ["1", "2"],
                       "seasons of the searched show lead, in their listed order")
    }

    /// Seasons must not be reordered within their tier: season 1 before 8.
    func test_rank_preservesSeasonOrder() {
        let ranked = SearchViewModel.rank([
            candidate("White Lotus, Season 1", "1", .series),
            candidate("White Lotus, Season 2", "2", .series),
            candidate("White Lotus, Season 3", "3", .series),
        ], for: "white lotus")

        XCTAssertEqual(ranked.map(\.storeID), ["1", "2", "3"])
    }

    /// Loose matches stay reachable rather than being filtered away, so a
    /// half-remembered title still shows something.
    func test_rank_keepsLooseMatches() {
        let ranked = SearchViewModel.rank([
            candidate("Great White Highway", "1"),
            candidate("The White Lotus, Season 1", "2", .series),
        ], for: "white lotus")

        XCTAssertEqual(ranked.count, 2)
        XCTAssertEqual(ranked.first?.storeID, "2")
    }

    func test_rank_ignoresPunctuationAndCase() {
        let ranked = SearchViewModel.rank([
            candidate("Unrelated", "1"),
            candidate("Spider-Man: No Way Home", "2"),
        ], for: "spiderman no way home")

        XCTAssertEqual(ranked.first?.storeID, "2")
    }
}

extension SearchViewModelTests {

    /// "Batman Beyond" previously led with the film "Return of the Joker":
    /// both are prefix matches, and CheapCharts returns season 3 before 1.
    func test_rank_numberedSeasonsLeadAndReadInOrder() {
        let ranked = SearchViewModel.rank([
            candidate("Batman Beyond: Return of the Joker", "film", .film),
            candidate("Batman Beyond, Season 3", "s3", .series),
            candidate("Batman Beyond, Season 1", "s1", .series),
            candidate("Batman Beyond, Season 2", "s2", .series),
        ], for: "batman beyond")

        XCTAssertEqual(ranked.map(\.storeID), ["s1", "s2", "s3", "film"])
    }

    /// Season 10 must not sort between 1 and 2.
    func test_rank_seasonsSortNumericallyNotLexically() {
        let ranked = SearchViewModel.rank([
            candidate("Show, Season 10", "10", .series),
            candidate("Show, Season 2", "2", .series),
            candidate("Show, Season 1", "1", .series),
        ], for: "show")

        XCTAssertEqual(ranked.map(\.storeID), ["1", "2", "10"])
    }
}
