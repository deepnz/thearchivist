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

    /// True for errors worth retrying after a conflict (another device won the race).
    nonisolated private static func isConflict(_ error: Error) -> Bool {
        guard let ckError = error as? CKError else { return false }
        if ckError.code == .serverRecordChanged { return true }
        if ckError.code == .partialFailure,
           let partial = ckError.partialErrorsByItemID?.values {
            return partial.contains { ($0 as? CKError)?.code == .serverRecordChanged }
        }
        return false
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

    /// Saves the item; on a changeTag conflict (e.g. the in-memory record is
    /// stale after a cache reload), re-applies our fields onto the server's
    /// copy and saves that instead. Our local edit wins field-for-field.
    func saveItem(_ item: LibraryItem) async throws {
        do {
            try await db.save(item.toCKRecord())
        } catch let error as CKError where error.code == .serverRecordChanged {
            guard let serverRecord = error.serverRecord else { throw error }
            try await db.save(item.apply(to: serverRecord))
        }
    }

    func deleteItem(_ item: LibraryItem) async throws {
        try await deleteRecord(recordName: item.id)
    }

    /// Deleting a record that never reached the server (offline add-then-remove)
    /// or was already deleted elsewhere is treated as success.
    func deleteRecord(recordName: String) async throws {
        do {
            try await db.deleteRecord(withID: CKRecord.ID(recordName: recordName))
        } catch let error as CKError where error.code == .unknownItem {
            // Already gone — the desired end state.
        }
    }

    // MARK: - LibraryCounter

    private let counterRecordID = CKRecord.ID(recordName: "library-counter")

    func nextCatalogID(type: MediaType) async -> String {
        for attempt in 0..<3 {
            do {
                let counter: CKRecord
                do {
                    counter = try await db.record(for: counterRecordID)
                } catch let error as CKError where error.code == .unknownItem {
                    counter = CKRecord(recordType: "LibraryCounter", recordID: counterRecordID)
                }

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
            } catch where Self.isConflict(error) {
                // Another device incremented first — back off and retry
                let delay: UInt64 = [500_000_000, 1_000_000_000, 2_000_000_000][attempt]
                try? await Task.sleep(nanoseconds: delay)
            } catch {
                // Offline / iCloud unavailable — retrying won't help. The
                // fallback ID is display-only and has no functional impact.
                return Self.fallbackCatalogID(type: type)
            }
        }
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

    /// Same conflict policy as saveItem: our fields win on a stale changeTag.
    func saveWatchlist(_ list: Watchlist) async throws {
        do {
            try await db.save(list.toCKRecord())
        } catch let error as CKError where error.code == .serverRecordChanged {
            guard let serverRecord = error.serverRecord else { throw error }
            try await db.save(list.apply(to: serverRecord))
        }
    }

    func deleteWatchlist(_ list: Watchlist) async throws {
        try await deleteRecord(recordName: list.id)
    }
}
