import SwiftUI
import Combine

@main
struct TheArchiveApp: App {
    @StateObject private var auth = AuthService()
    @StateObject private var ck = CloudKitService()
    @StateObject private var libraryVM = LibraryViewModel()
    @StateObject private var searchVM = SearchViewModel()
    @StateObject private var watchlistVM = WatchlistViewModel()
    @State private var selectedTab = 0

    var body: some Scene {
        WindowGroup {
            Group {
                if auth.isSignedIn {
                    TabView(selection: $selectedTab) {
                        LibraryView()
                            .tabItem { Label("Library", systemImage: "film") }
                            .tag(0)
                        WatchlistsView()
                            .tabItem { Label("Watchlists", systemImage: "list.bullet") }
                            .tag(1)
                        SearchView()
                            .tabItem { Label("Search", systemImage: "magnifyingglass") }
                            .tag(2)
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

            let liveIDs = Set(fetchedItems.map(\.iTunesID))
            await watchlistVM.pruneStale(liveITunesIDs: liveIDs, using: ck)
        } catch {
            // Fetch failed — preserve existing local state rather than wiping it.
            print("loadData failed: \(error.localizedDescription)")
            AppEventLog.record(.fetchFailure, error: error)
        }
        #endif
    }
}
