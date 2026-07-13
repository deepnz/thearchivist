import Foundation

/// Builds `videos://` URLs that open the Apple TV app on a specific title.
///
/// Strategy, in order of reliability:
/// 1. The canonical store URL Apple's own Search API returned for the title
///    (`trackViewUrl` / `collectionViewUrl`), with the scheme swapped to
///    `videos://` so tvOS routes it to the TV app instead of Safari-less web.
/// 2. For legacy records saved before store URLs were captured: a URL
///    constructed from the iTunes ID in the store's canonical path format.
/// 3. A TV-app search for the title, guaranteed to land the user somewhere
///    useful even if the direct ID link cannot resolve.
enum AppleTVLink {

    /// Direct link to the title's page in the Apple TV app.
    static func directURL(for item: LibraryItem) -> URL? {
        if let url = storePageURL(from: item.storeURL) {
            return url
        }
        return constructedURL(type: item.type,
                              iTunesID: item.iTunesID,
                              country: iTunesService.storefrontCountry)
    }

    /// Scheme-swapped canonical store URL (`https://itunes.apple.com/...` →
    /// `videos://itunes.apple.com/...`). Returns nil for empty/foreign URLs.
    static func storePageURL(from storeURL: String) -> URL? {
        guard !storeURL.isEmpty,
              var components = URLComponents(string: storeURL),
              let host = components.host,
              host == "itunes.apple.com" || host.hasSuffix(".itunes.apple.com")
        else { return nil }
        components.scheme = "videos"
        return components.url
    }

    /// Fallback for items that predate stored store URLs. Mirrors the
    /// canonical iTunes Store path format (`/{country}/movie/id{id}`).
    static func constructedURL(type: MediaType, iTunesID: String, country: String) -> URL? {
        guard !iTunesID.isEmpty, Int(iTunesID) != nil else { return nil }
        let path = type == .film ? "movie" : "tv-season"
        return URL(string: "videos://itunes.apple.com/\(country)/\(path)/id\(iTunesID)")
    }

    /// Last-resort fallback: open the TV app's search pre-filled with the title.
    static func searchURL(for title: String) -> URL? {
        var components = URLComponents(string: "videos://itunes.apple.com/search")
        components?.queryItems = [URLQueryItem(name: "term", value: title)]
        return components?.url
    }
}
