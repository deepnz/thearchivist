import CloudKit
import Combine
import Foundation

@MainActor
final class CloudKitService: ObservableObject {
    private let container: CKContainer
    private var db: CKDatabase { container.privateCloudDatabase }

    init(containerID: String = "iCloud.deepak-nalla.TheArchive") {
        container = CKContainer(identifier: containerID)
    }

    // MARK: - CatalogID helpers (static, testable)

    nonisolated static func formatCatalogID(type: MediaType, count: Int) -> String {
        let prefix = type == .film ? "MV" : "SV"
        return "\(prefix)-\(String(format: "%04d", count))"
    }

    nonisolated static func fallbackCatalogID(type: MediaType) -> String {
        type == .film ? "MV-????" : "SV-????"
    }

    nonisolated static func pruneStaleIDs(watchlist: Watchlist, liveITunesIDs: Set<String>) -> Watchlist {
        var updated = watchlist
        updated.itemIDs = watchlist.itemIDs.filter { liveITunesIDs.contains($0) }
        return updated
    }

    // MARK: - Library Items

    func fetchAllItems() async throws -> [LibraryItem] {
        let query = CKQuery(recordType: LibraryItem.recordType,
                            predicate: NSPredicate(value: true))
        var items: [LibraryItem] = []
        var cursor: CKQueryOperation.Cursor? = nil
        repeat {
            let (results, nextCursor) = cursor == nil
                ? try await db.records(matching: query)
                : try await db.records(continuingMatchFrom: cursor!)
            items += results.compactMap { _, result in try? result.get() }
                            .compactMap { LibraryItem(record: $0) }
            cursor = nextCursor
        } while cursor != nil
        return items
    }

    // Callers use `try?` and discard these errors, so failures were previously
    // invisible. Logging here catches every call site in one place; the error
    // is still rethrown so callers behave exactly as before.

    /// Saves an item and returns it carrying the server's record.
    ///
    /// Callers must keep the returned value. A LibraryItem built from the
    /// memberwise initialiser has no ckRecord, so toCKRecord() constructs a
    /// fresh CKRecord with the same ID; saving that a second time is an insert,
    /// and CloudKit rejects it with "record to insert already exists". Holding
    /// the saved record means later edits are updates, and it preserves the
    /// changeTag needed for conflict detection.
    @discardableResult
    func saveItem(_ item: LibraryItem) async throws -> LibraryItem {
        let record = item.toCKRecord()
        do {
            try await db.save(record)
            var saved = item
            saved.ckRecord = record
            return saved
        } catch {
            AppEventLog.record(.saveItemFailure, error: error,
                               context: "\(item.catalogID) \(item.title)")
            throw error
        }
    }

    func deleteItem(_ item: LibraryItem) async throws {
        let recordID = CKRecord.ID(recordName: item.id)
        do {
            try await db.deleteRecord(withID: recordID)
        } catch {
            AppEventLog.record(.deleteItemFailure, error: error,
                               context: "\(item.catalogID) \(item.title)")
            throw error
        }
    }

    func itemExists(iTunesID: String) async throws -> Bool {
        let pred = NSPredicate(format: "iTunesID == %@", iTunesID)
        let query = CKQuery(recordType: LibraryItem.recordType, predicate: pred)
        let (results, _) = try await db.records(matching: query, resultsLimit: 1)
        return !results.isEmpty
    }

    // MARK: - LibraryCounter

    private let counterRecordID = CKRecord.ID(recordName: "library-counter")

    func nextCatalogID(type: MediaType) async -> String {
        for attempt in 0..<3 {
            do {
                let counter = (try? await db.record(for: counterRecordID))
                    ?? CKRecord(recordType: "LibraryCounter", recordID: counterRecordID)

                let key = type == .film ? "filmCount" : "seriesCount"
                let current = counter[key] as? Int ?? 0
                let next = current + 1
                counter[key] = next

                let op = CKModifyRecordsOperation(recordsToSave: [counter])
                op.savePolicy = .ifServerRecordUnchanged
                try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
                    op.modifyRecordsResultBlock = { result in
                        switch result {
                        case .success: cont.resume()
                        case .failure(let e): cont.resume(throwing: e)
                        }
                    }
                    db.add(op)
                }
                return Self.formatCatalogID(type: type, count: next)
            } catch {
                // Conflict — wait with exponential backoff then retry
                let delay: UInt64 = [500_000_000, 1_000_000_000, 2_000_000_000][attempt]
                try? await Task.sleep(nanoseconds: delay)
            }
        }
        // All retries lost the race or CloudKit was unreachable. The item is
        // permanently branded with a placeholder catalog ID, so make it visible.
        AppEventLog.record(.catalogIDFallback,
                           message: "all 3 attempts failed; using placeholder",
                           context: Self.fallbackCatalogID(type: type))
        return Self.fallbackCatalogID(type: type)
    }

    // MARK: - Watchlists

    func fetchAllWatchlists() async throws -> [Watchlist] {
        let query = CKQuery(recordType: Watchlist.recordType,
                            predicate: NSPredicate(value: true))
        var lists: [Watchlist] = []
        var cursor: CKQueryOperation.Cursor? = nil
        repeat {
            let (results, nextCursor) = cursor == nil
                ? try await db.records(matching: query)
                : try await db.records(continuingMatchFrom: cursor!)
            lists += results.compactMap { _, result in try? result.get() }
                            .compactMap { Watchlist(record: $0) }
            cursor = nextCursor
        } while cursor != nil
        return lists
    }

    /// Saves a watchlist and returns it carrying the server's record.
    /// See saveItem for why the caller must keep the returned value.
    @discardableResult
    func saveWatchlist(_ list: Watchlist) async throws -> Watchlist {
        let record = list.toCKRecord()
        do {
            try await db.save(record)
            var saved = list
            saved.ckRecord = record
            return saved
        } catch {
            AppEventLog.record(.saveWatchlistFailure, error: error, context: list.name)
            throw error
        }
    }

    func deleteWatchlist(_ list: Watchlist) async throws {
        let recordID = CKRecord.ID(recordName: list.id)
        do {
            try await db.deleteRecord(withID: recordID)
        } catch {
            AppEventLog.record(.deleteWatchlistFailure, error: error, context: list.name)
            throw error
        }
    }
}
