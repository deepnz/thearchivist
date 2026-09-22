import Foundation
import StoreKit

/// The iTunes storefront the device buys from.
///
/// Every request in the search path has to name the same storefront, because
/// store IDs do not cross regions: id 1520266716 is Good Will Hunting in the
/// US store and resolves to nothing in the German one, which sells the same
/// film as 1531231017. A library item therefore stores an ID that is only
/// meaningful in the storefront it was added from.
enum Storefront {

    /// The regions CheapCharts tracks for the iTunes store, per
    /// https://www.cheapcharts.com/llms.txt. A device outside this set falls
    /// back to `us`, which is the broadest catalogue and what the app queried
    /// unconditionally before this existed.
    static let supported: Set<String> = [
        "us", "de", "gb", "fr", "au", "ca", "at", "ch",
        "es", "pt", "ru", "jp", "tr", "pl", "in", "cn",
    ]

    static let fallback = "us"

    /// Resolved once at launch by `refresh()`. `StoreKit.Storefront.current` is
    /// an async property, and the search path is called from synchronous
    /// request builders, so the value is cached rather than awaited per call.
    /// A storefront does not change while the app is running short of the user
    /// switching store accounts, which `StoreKit.Storefront.updates` reports.
    nonisolated(unsafe) private static var cached: String?

    /// The storefront to query, as a lowercase two-letter code.
    ///
    /// Falls back to the device locale, then to `us`, until `refresh()` has
    /// resolved the real storefront. Locale is only a fallback: a device set to
    /// one region can be signed in to another region's store, and the store is
    /// what decides which IDs are valid.
    static var current: String {
        if let cached { return cached }
        if let region = Locale.current.region?.identifier.lowercased(),
           supported.contains(region) {
            return region
        }
        return fallback
    }

    /// Resolves the storefront from StoreKit and caches it.
    ///
    /// StoreKit is authoritative because it reports the store the device
    /// actually purchases from, which is what the deep link has to match. It
    /// reports an ISO 3166-1 alpha-3 code ("USA") while both APIs take alpha-2
    /// ("us"), so it is mapped.
    static func refresh() async {
        guard let code = await StoreKit.Storefront.current?.countryCode,
              let mapped = alpha2(fromAlpha3: code),
              supported.contains(mapped)
        else { return }
        cached = mapped
    }

    /// Overrides the cached value. Tests only.
    static func override(_ code: String?) { cached = code }

    /// Maps the alpha-3 code StoreKit reports to the alpha-2 the APIs take.
    ///
    /// Only the supported storefronts are listed: anything else would fall back
    /// to `us` regardless, so a full ISO table would be dead weight.
    static func alpha2(fromAlpha3 alpha3: String) -> String? {
        switch alpha3.uppercased() {
        case "USA": return "us"
        case "DEU": return "de"
        case "GBR": return "gb"
        case "FRA": return "fr"
        case "AUS": return "au"
        case "CAN": return "ca"
        case "AUT": return "at"
        case "CHE": return "ch"
        case "ESP": return "es"
        case "PRT": return "pt"
        case "RUS": return "ru"
        case "JPN": return "jp"
        case "TUR": return "tr"
        case "POL": return "pl"
        case "IND": return "in"
        case "CHN": return "cn"
        default: return nil
        }
    }

    /// The storefront segment for an Apple TV deep link, e.g. "us" in
    /// https://tv.apple.com/us/movie/id123. Apple uses alpha-2 here too.
    static var deepLinkRegion: String { current }
}
