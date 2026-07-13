import SwiftUI

@main
struct TheArchiveApp: App {
    @StateObject private var auth: AuthService
    @StateObject private var ck: CloudKitService
    @StateObject private var libraryVM: LibraryViewModel
    @StateObject private var searchVM: SearchViewModel
    @StateObject private var watchlistVM: WatchlistViewModel
    @StateObject private var dataStore: DataStore

    init() {
        // Poster artwork benefits heavily from an on-disk HTTP cache: the
        // default shared URLCache is far too small for a grid of images.
        URLCache.shared = URLCache(memoryCapacity: 32 * 1024 * 1024,
                                   diskCapacity: 256 * 1024 * 1024)

        let auth = AuthService()
        let ck = CloudKitService()
        let libraryVM = LibraryViewModel()
        let searchVM = SearchViewModel()
        let watchlistVM = WatchlistViewModel()
        let dataStore = DataStore(cloud: ck, library: libraryVM, watchlists: watchlistVM)

        _auth = StateObject(wrappedValue: auth)
        _ck = StateObject(wrappedValue: ck)
        _libraryVM = StateObject(wrappedValue: libraryVM)
        _searchVM = StateObject(wrappedValue: searchVM)
        _watchlistVM = StateObject(wrappedValue: watchlistVM)
        _dataStore = StateObject(wrappedValue: dataStore)
    }

    var body: some Scene {
        WindowGroup {
            Group {
                if auth.isSignedIn {
                    TabView {
                        LibraryView()
                            .tabItem { Label("Library", systemImage: "film") }
                        WatchlistsView()
                            .tabItem { Label("Watchlists", systemImage: "list.bullet") }
                        SearchView()
                            .tabItem { Label("Search", systemImage: "magnifyingglass") }
                    }
                    .task {
                        libraryVM.startMonitoring()
                        await loadData()
                    }
                } else {
                    SignInView()
                }
            }
            .preferredColorScheme(.dark)
            .environmentObject(auth)
            .environmentObject(ck)
            .environmentObject(libraryVM)
            .environmentObject(searchVM)
            .environmentObject(watchlistVM)
            .environmentObject(dataStore)
            .onChange(of: auth.isSignedIn) { _, signedIn in
                // On sign-out / credential revocation, on-device data and any
                // queued writes belong to the previous account — discard them.
                if !signedIn { dataStore.clearLocal() }
            }
            .onReceive(NotificationCenter.default.publisher(for: UIApplication.willEnterForegroundNotification)) { _ in
                Task {
                    await auth.checkCredentialState()
                    await dataStore.flushPending()
                }
            }
        }
    }

    private func loadData() async {
        // 1. On-device snapshot: instant, works fully offline.
        let hadCache = dataStore.loadFromCache()
        // Only show the loading state on a true first launch with nothing local.
        libraryVM.isLoading = !hadCache

        // 2. CloudKit: reconcile, then push anything still queued.
        await dataStore.refreshFromCloud()
        libraryVM.isLoading = false
    }
}
