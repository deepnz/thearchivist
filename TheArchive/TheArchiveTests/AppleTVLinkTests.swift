import XCTest
@testable import TheArchive

final class AppleTVLinkTests: XCTestCase {

    private func makeItem(type: MediaType, iTunesID: String, storeURL: String) -> LibraryItem {
        LibraryItem(id: "1", catalogID: "MV-0001", iTunesID: iTunesID,
                    title: "Inception", year: 2010, type: type,
                    artworkURL: "", storeURL: storeURL,
                    genres: [], watched: false, dateAdded: Date())
    }

    // MARK: - Canonical store URL path (preferred)

    func test_directURL_swapsSchemeOnCanonicalStoreURL() {
        let item = makeItem(type: .film, iTunesID: "401089509",
                            storeURL: "https://itunes.apple.com/us/movie/inception/id401089509?uo=4")
        let url = AppleTVLink.directURL(for: item)
        XCTAssertEqual(url?.absoluteString,
                       "videos://itunes.apple.com/us/movie/inception/id401089509?uo=4")
    }

    func test_directURL_series_usesCollectionPage() {
        let item = makeItem(type: .series, iTunesID: "273381456",
                            storeURL: "https://itunes.apple.com/us/tv-season/breaking-bad-season-1/id273381456?uo=4")
        let url = AppleTVLink.directURL(for: item)
        XCTAssertEqual(url?.absoluteString,
                       "videos://itunes.apple.com/us/tv-season/breaking-bad-season-1/id273381456?uo=4")
    }

    func test_storePageURL_rejectsForeignHosts() {
        // A store URL must never send the user to an arbitrary domain.
        XCTAssertNil(AppleTVLink.storePageURL(from: "https://evil.example.com/movie/id1"))
        XCTAssertNil(AppleTVLink.storePageURL(from: "https://apple.com.evil.example.com/id1"))
        XCTAssertNil(AppleTVLink.storePageURL(from: ""))
    }

    // MARK: - Constructed fallback for legacy records

    func test_directURL_legacyItem_constructsCanonicalPath() {
        let item = makeItem(type: .film, iTunesID: "401089509", storeURL: "")
        let url = AppleTVLink.constructedURL(type: item.type, iTunesID: item.iTunesID, country: "us")
        XCTAssertEqual(url?.absoluteString, "videos://itunes.apple.com/us/movie/id401089509")
    }

    func test_constructedURL_series_usesTVSeasonPath() {
        let url = AppleTVLink.constructedURL(type: .series, iTunesID: "273381456", country: "gb")
        XCTAssertEqual(url?.absoluteString, "videos://itunes.apple.com/gb/tv-season/id273381456")
    }

    func test_constructedURL_rejectsNonNumericID() {
        XCTAssertNil(AppleTVLink.constructedURL(type: .film, iTunesID: "not-a-number", country: "us"))
        XCTAssertNil(AppleTVLink.constructedURL(type: .film, iTunesID: "", country: "us"))
    }

    // MARK: - Search fallback

    func test_searchURL_encodesTitle() {
        let url = AppleTVLink.searchURL(for: "The Dark Knight")
        XCTAssertNotNil(url)
        XCTAssertEqual(url?.scheme, "videos")
        XCTAssertFalse(url!.absoluteString.contains(" "))
        XCTAssertTrue(url!.absoluteString.contains("term=The%20Dark%20Knight"))
    }
}
