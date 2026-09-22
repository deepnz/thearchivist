import XCTest
@testable import TheArchive

final class StorefrontTests: XCTestCase {

    override func tearDown() {
        Storefront.override(nil)
        super.tearDown()
    }

    // MARK: - alpha-3 to alpha-2

    /// StoreKit reports ISO 3166-1 alpha-3; both APIs take alpha-2.
    func test_alpha2_mapsEverySupportedStorefront() {
        let pairs = [
            ("USA", "us"), ("DEU", "de"), ("GBR", "gb"), ("FRA", "fr"),
            ("AUS", "au"), ("CAN", "ca"), ("AUT", "at"), ("CHE", "ch"),
            ("ESP", "es"), ("PRT", "pt"), ("RUS", "ru"), ("JPN", "jp"),
            ("TUR", "tr"), ("POL", "pl"), ("IND", "in"), ("CHN", "cn"),
        ]
        for (alpha3, alpha2) in pairs {
            XCTAssertEqual(Storefront.alpha2(fromAlpha3: alpha3), alpha2)
            XCTAssertTrue(Storefront.supported.contains(alpha2),
                          "\(alpha2) must be in the supported set")
        }
    }

    func test_alpha2_isCaseInsensitive() {
        XCTAssertEqual(Storefront.alpha2(fromAlpha3: "usa"), "us")
        XCTAssertEqual(Storefront.alpha2(fromAlpha3: "Deu"), "de")
    }

    /// An unsupported storefront maps to nil so `current` falls back.
    func test_alpha2_nilForUnsupportedStorefront() {
        XCTAssertNil(Storefront.alpha2(fromAlpha3: "BRA"))
        XCTAssertNil(Storefront.alpha2(fromAlpha3: ""))
    }

    // MARK: - current

    func test_current_usesResolvedStorefront() {
        Storefront.override("de")
        XCTAssertEqual(Storefront.current, "de")
        XCTAssertEqual(Storefront.deepLinkRegion, "de")
    }

    /// Before `refresh()` resolves, the value must still be usable.
    func test_current_fallsBackToASupportedRegion() {
        Storefront.override(nil)
        XCTAssertTrue(Storefront.supported.contains(Storefront.current),
                      "the fallback must itself be a queryable storefront")
    }

    func test_fallback_isUS() {
        XCTAssertEqual(Storefront.fallback, "us")
    }

    // MARK: - Threading through the request builders

    func test_searchURL_carriesResolvedStorefront() {
        Storefront.override("gb")
        let url = CheapChartsService.searchURL(query: "Titanic")
        XCTAssertTrue(url!.absoluteString.contains("country=gb"))
    }

    /// Lookup takes an uppercase code, unlike CheapCharts.
    func test_lookupURL_carriesResolvedStorefrontUppercased() {
        Storefront.override("de")
        let url = iTunesLookupService.lookupURL(ids: ["1531231017"])
        XCTAssertTrue(url!.absoluteString.contains("country=DE"))
    }

    /// The region must be consistent across search and lookup: store IDs do
    /// not cross storefronts, so a mismatch resolves to nothing.
    func test_searchAndLookup_agreeOnStorefront() {
        Storefront.override("fr")
        let search = CheapChartsService.searchURL(query: "x")!.absoluteString
        let lookup = iTunesLookupService.lookupURL(ids: ["1"])!.absoluteString
        XCTAssertTrue(search.contains("country=fr"))
        XCTAssertTrue(lookup.contains("country=FR"))
    }

    func test_explicitCountryOverridesResolved() {
        Storefront.override("us")
        let url = CheapChartsService.searchURL(query: "x", country: "jp")
        XCTAssertTrue(url!.absoluteString.contains("country=jp"))
    }
}
