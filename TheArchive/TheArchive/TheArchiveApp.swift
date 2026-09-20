import SwiftUI
import Combine
import CloudKit

@main
struct TheArchiveApp: App {
    @StateObject private var auth = AuthService()
    @StateObject private var ck = CloudKitService()
    @StateObject private var libraryVM = LibraryViewModel()
    @StateObject private var searchVM = SearchViewModel()
    @StateObject private var watchlistVM = WatchlistViewModel()
    /// Tag 2 is Search, which is the leftmost tab and the useful starting
    /// point on a fresh install.
    @State private var selectedTab = 2

    var body: some Scene {
        WindowGroup {
            Group {
                if auth.isSignedIn {
                    // Search leads: on a fresh install the library is empty, so
                    // adding titles is the first thing anyone needs to do.
                    // Tags stay bound to the view, not the position, so the
                    // -uiPreviewTab screenshot flag keeps working.
                    TabView(selection: $selectedTab) {
                        SearchView()
                            .tabItem { Label("Search", systemImage: "magnifyingglass") }
                            .tag(2)
                        LibraryView()
                            .tabItem { Label("Library", systemImage: "film") }
                            .tag(0)
                        WatchlistsView()
                            .tabItem { Label("Watchlists", systemImage: "list.bullet") }
                            .tag(1)
                    }
                    .onAppear {
                        #if DEBUG && targetEnvironment(simulator)
                        if let tab = UIPreviewFlags.requestedTab {
                            selectedTab = tab
                        }
                        #endif
                    }
                    .task {
                        libraryVM.startMonitoring()
                        await loadData()
                        #if DEBUG && targetEnvironment(simulator)
                        // Select after loadData, so the list exists to select.
                        if UIPreviewFlags.requestedTab == 1, watchlistVM.selectedListID == nil {
                            watchlistVM.selectedListID = watchlistVM.watchlists.first?.id
                        }
                        #endif
                    }
                } else {
                    SignInView()
                }
            }
            .preferredColorScheme(.dark)
            .overlay(GrainOverlay().ignoresSafeArea())
            .environmentObject(auth)
            .environmentObject(ck)
            .environmentObject(libraryVM)
            .environmentObject(searchVM)
            .environmentObject(watchlistVM)
            .onReceive(NotificationCenter.default.publisher(for: UIApplication.willEnterForegroundNotification)) { _ in
                Task { await auth.checkCredentialState() }
            }
            .task {
                // Written on every launch regardless of sign-in state, so the
                // dashboard shows whether the device can reach CloudKit at all.
                AppEventLog.record(.launch, message: "app launched",
                                   context: "signedIn=\(auth.isSignedIn)")
            }
            #if DEBUG && targetEnvironment(simulator)
            .onReceive(libraryVM.objectWillChange) { _ in
                DispatchQueue.main.async {
                    SimDevStore.save(items: libraryVM.items, lists: watchlistVM.watchlists)
                }
            }
            .onReceive(watchlistVM.objectWillChange) { _ in
                DispatchQueue.main.async {
                    SimDevStore.save(items: libraryVM.items, lists: watchlistVM.watchlists)
                }
            }
            #endif
        }
    }

    private func loadData() async {
        libraryVM.isLoading = true
        defer { libraryVM.isLoading = false }

        #if DEBUG && targetEnvironment(simulator)
        // Simulator has no iCloud — load from local JSON cache instead of CloudKit.
        let (items, lists) = SimDevStore.load()
        libraryVM.items = items
        watchlistVM.watchlists = lists
        return
        #else
        do {
            let fetchedItems = try await ck.fetchAllItems()
            let fetchedLists = try await ck.fetchAllWatchlists()
            libraryVM.items = fetchedItems
            watchlistVM.watchlists = fetchedLists
            libraryVM.loadError = nil

            let liveIDs = Set(fetchedItems.map(\.iTunesID))
            await watchlistVM.pruneStale(liveITunesIDs: liveIDs, using: ck)
        } catch {
            // Fetch failed — preserve existing local state rather than wiping it.
            print("loadData failed: \(error.localizedDescription)")
            AppEventLog.record(.fetchFailure, error: error)

            // "Did not find record type" is the expected response on a fresh
            // account: nothing has been saved yet, so the type does not exist.
            // That is a genuinely empty library, not an error worth alarming
            // anyone about.
            let ckError = error as NSError
            let isMissingRecordType = ckError.domain == CKErrorDomain
                && ckError.code == CKError.Code.unknownItem.rawValue

            libraryVM.loadError = isMissingRecordType
                ? nil
                : "Could not load your library. \(ckError.localizedDescription)"
        }
        #endif
    }
}
