import Foundation
import Combine

/// Local-first repository coordinating the in-memory view models, the
/// on-device snapshot (LocalStore), and CloudKit.
///
/// Every mutation:
/// 1. updates the view models immediately (UI never waits on the network),
/// 2. persists the full snapshot to disk,
/// 3. queues the change and attempts a CloudKit sync in the background.
///
/// Changes CloudKit rejects (offline, iCloud unavailable) stay queued and are
/// retried when connectivity returns and on every app foreground.
@MainActor
final class DataStore: ObservableObject {
    private let cloud: CloudKitService
    private let library: LibraryViewModel
    private let watchlists: WatchlistViewModel
    private let local: LocalStore

    private var pendingItemSaves: Set<String> = []
    private var pendingItemDeletes: Set<String> = []
    private var pendingListSaves: Set<String> = []
    private var pendingListDeletes: Set<String> = []

    private var isFlushing = false
    private var cancellables: Set<AnyCancellable> = []

    init(cloud: CloudKitService,
         library: LibraryViewModel,
         watchlists: WatchlistViewModel,
         local: LocalStore = LocalStore()) {
        self.cloud = cloud
        self.library = library
        self.watchlists = watchlists
        self.local = local

        // Push queued changes as soon as connectivity returns.
        library.$isOffline
            .removeDuplicates()
            .dropFirst()
            .filter { !$0 }
            .sink { [weak self] _ in
                Task { await self?.flushPending() }
            }
            .store(in: &cancellables)
    }

    // MARK: - Loading

    /// Populates the view models from the on-device snapshot.
    /// Returns true if a snapshot existed.
    @discardableResult
    func loadFromCache() -> Bool {
        guard let snapshot = local.load() else { return false }
        library.items = snapshot.items
        watchlists.watchlists = snapshot.watchlists
        pendingItemSaves = Set(snapshot.pendingItemSaves)
        pendingItemDeletes = Set(snapshot.pendingItemDeletes)
        pendingListSaves = Set(snapshot.pendingListSaves)
        pendingListDeletes = Set(snapshot.pendingListDeletes)
        return true
    }

    /// Pulls the latest state from CloudKit and reconciles it with local
    /// pending changes (local unsynced edits win; everything else takes the
    /// server's version). Silently keeps cached data when unreachable.
    func refreshFromCloud() async {
        do {
            async let itemsFetch = cloud.fetchAllItems()
            async let listsFetch = cloud.fetchAllWatchlists()
            let (remoteItems, remoteLists) = try await (itemsFetch, listsFetch)

            library.items = Self.merge(remote: remoteItems,
                                       localItems: library.items,
                                       pendingSaves: pendingItemSaves,
                                       pendingDeletes: pendingItemDeletes)
            watchlists.watchlists = Self.merge(remote: remoteLists,
                                               localItems: watchlists.watchlists,
                                               pendingSaves: pendingListSaves,
                                               pendingDeletes: pendingListDeletes)
            pruneStaleWatchlistEntries()
            persist()
            await flushPending()
        } catch {
            // Offline or iCloud unavailable — the cached snapshot stands.
        }
    }

    /// Server state wins except for records with local changes CloudKit
    /// hasn't accepted yet.
    nonisolated static func merge<T: Identifiable>(remote: [T],
                                                   localItems: [T],
                                                   pendingSaves: Set<String>,
                                                   pendingDeletes: Set<String>) -> [T] where T.ID == String {
        var merged = remote.filter { !pendingDeletes.contains($0.id) }
        for id in pendingSaves {
            guard let localVersion = localItems.first(where: { $0.id == id }) else { continue }
            if let idx = merged.firstIndex(where: { $0.id == id }) {
                merged[idx] = localVersion
            } else {
                merged.append(localVersion)
            }
        }
        return merged
    }

    // MARK: - Library item mutations

    func saveItem(_ item: LibraryItem) {
        if let idx = library.items.firstIndex(where: { $0.id == item.id }) {
            library.items[idx] = item
        } else {
            library.items.append(item)
        }
        pendingItemSaves.insert(item.id)
        persist()
        Task { await flushPending() }
    }

    func deleteItem(_ item: LibraryItem) {
        library.items.removeAll { $0.id == item.id }

        // Prune the removed title from every watchlist that references it.
        if !library.items.contains(where: { $0.iTunesID == item.iTunesID }) {
            for idx in watchlists.watchlists.indices
            where watchlists.watchlists[idx].itemIDs.contains(item.iTunesID) {
                watchlists.watchlists[idx].itemIDs.removeAll { $0 == item.iTunesID }
                pendingListSaves.insert(watchlists.watchlists[idx].id)
            }
        }

        pendingItemSaves.remove(item.id)
        pendingItemDeletes.insert(item.id)
        persist()
        Task { await flushPending() }
    }

    // MARK: - Watchlist mutations

    func saveWatchlist(_ list: Watchlist) {
        if let idx = watchlists.watchlists.firstIndex(where: { $0.id == list.id }) {
            watchlists.watchlists[idx] = list
        } else {
            watchlists.watchlists.append(list)
        }
        pendingListSaves.insert(list.id)
        persist()
        Task { await flushPending() }
    }

    func deleteWatchlist(_ list: Watchlist) {
        watchlists.watchlists.removeAll { $0.id == list.id }
        if watchlists.selectedListID == list.id { watchlists.selectedListID = nil }
        pendingListSaves.remove(list.id)
        pendingListDeletes.insert(list.id)
        persist()
        Task { await flushPending() }
    }

    // MARK: - Sync

    /// Attempts to push every queued change to CloudKit. Failures keep the
    /// change queued for the next flush (reconnect, foreground, next launch).
    func flushPending() async {
        guard !isFlushing else { return }
        isFlushing = true
        defer { isFlushing = false }

        var anyProgress = false

        for recordName in Array(pendingItemDeletes) {
            do {
                try await cloud.deleteRecord(recordName: recordName)
                pendingItemDeletes.remove(recordName)
                anyProgress = true
            } catch { /* still offline — keep queued */ }
        }

        for id in Array(pendingItemSaves) {
            guard let item = library.items.first(where: { $0.id == id }) else {
                pendingItemSaves.remove(id) // deleted since it was queued
                anyProgress = true
                continue
            }
            do {
                try await cloud.saveItem(item)
                pendingItemSaves.remove(id)
                anyProgress = true
            } catch { /* keep queued */ }
        }

        for recordName in Array(pendingListDeletes) {
            do {
                try await cloud.deleteRecord(recordName: recordName)
                pendingListDeletes.remove(recordName)
                anyProgress = true
            } catch { /* keep queued */ }
        }

        for id in Array(pendingListSaves) {
            guard let list = watchlists.watchlists.first(where: { $0.id == id }) else {
                pendingListSaves.remove(id)
                anyProgress = true
                continue
            }
            do {
                try await cloud.saveWatchlist(list)
                pendingListSaves.remove(id)
                anyProgress = true
            } catch { /* keep queued */ }
        }

        if anyProgress { persist() }
    }

    // MARK: - Housekeeping

    /// Removes watchlist references to titles no longer in the library.
    private func pruneStaleWatchlistEntries() {
        let liveIDs = Set(library.items.map(\.iTunesID))
        for idx in watchlists.watchlists.indices {
            let pruned = CloudKitService.pruneStaleIDs(watchlist: watchlists.watchlists[idx],
                                                       liveITunesIDs: liveIDs)
            if pruned.itemIDs != watchlists.watchlists[idx].itemIDs {
                watchlists.watchlists[idx] = pruned
                pendingListSaves.insert(pruned.id)
            }
        }
    }

    /// Wipes on-device data. Called on sign-out — the library belongs to the
    /// signed-in user's iCloud account, and queued writes for a revoked
    /// credential can never sync (see DESIGN_SPEC offline behavior).
    func clearLocal() {
        library.items = []
        watchlists.watchlists = []
        watchlists.selectedListID = nil
        pendingItemSaves = []
        pendingItemDeletes = []
        pendingListSaves = []
        pendingListDeletes = []
        local.clear()
    }

    private func persist() {
        local.save(LibrarySnapshot(
            items: library.items,
            watchlists: watchlists.watchlists,
            pendingItemSaves: Array(pendingItemSaves),
            pendingItemDeletes: Array(pendingItemDeletes),
            pendingListSaves: Array(pendingListSaves),
            pendingListDeletes: Array(pendingListDeletes)
        ))
    }
}
