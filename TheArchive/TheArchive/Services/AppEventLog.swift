import CloudKit
import Foundation
#if canImport(UIKit)
import UIKit
#endif

/// Writes diagnostic events to CloudKit so failures are visible in the
/// dashboard under Records, without a Mac attached to the device.
///
/// This exists because the app's CloudKit writes are fire-and-forget with
/// errors discarded, and Sign in with Apple failures were silent. CloudKit's
/// Telemetry and Logs pages only report Apple's own request metrics, so
/// application-level diagnostics have to be records we write ourselves.
///
/// Deliberately independent of AuthService: events must still be recorded when
/// sign-in is the thing that failed. Writes go to the private database, which
/// requires an iCloud account on the device but not an app sign-in.
enum AppEventLog {

    static let recordType = "AppEvent"

    /// Event names are dotted and stable so the dashboard can be filtered.
    enum Name: String {
        case authFailure = "auth.failure"
        case authUnexpectedCredential = "auth.unexpected_credential"
        case authSuccess = "auth.success"
        case fetchFailure = "ck.fetch.failure"
        case saveItemFailure = "ck.saveItem.failure"
        case deleteItemFailure = "ck.deleteItem.failure"
        case saveWatchlistFailure = "ck.saveWatchlist.failure"
        case deleteWatchlistFailure = "ck.deleteWatchlist.failure"
        case catalogIDFallback = "ck.catalogID.fallback"
        case launch = "app.launch"
    }

    private enum Keys {
        static let name = "name"
        static let message = "message"
        static let context = "context"
        static let timestamp = "timestamp"
        static let systemVersion = "systemVersion"
        static let deviceModel = "deviceModel"
        static let appVersion = "appVersion"
    }

    private static let container = CKContainer(identifier: "iCloud.deepak-nalla.TheArchive")

    /// Serialises writes so a burst of failures cannot flood CloudKit.
    private static let queue = DispatchQueue(label: "archive.appeventlog")

    /// Guards against an error loop: if logging itself fails, stop trying.
    nonisolated(unsafe) private static var isDisabled = false

    private static var systemVersion: String {
        #if canImport(UIKit)
        return UIDevice.current.systemVersion
        #else
        return ProcessInfo.processInfo.operatingSystemVersionString
        #endif
    }

    private static var deviceModel: String {
        var size = 0
        sysctlbyname("hw.machine", nil, &size, nil, 0)
        guard size > 0 else { return "unknown" }
        var machine = [CChar](repeating: 0, count: size)
        sysctlbyname("hw.machine", &machine, &size, nil, 0)
        return String(cString: machine)
    }

    private static var appVersion: String {
        let info = Bundle.main.infoDictionary
        let short = info?["CFBundleShortVersionString"] as? String ?? "?"
        let build = info?["CFBundleVersion"] as? String ?? "?"
        return "\(short) (\(build))"
    }

    /// Records an event. Fire-and-forget by design: logging must never block or
    /// fail the operation it is describing.
    ///
    /// - Parameters:
    ///   - name: stable dotted event name, filterable in the dashboard.
    ///   - message: human-readable detail, usually an error description.
    ///   - context: optional extra detail, e.g. which item was being saved.
    static func record(_ name: Name, message: String, context: String? = nil) {
        // Always print, so the Xcode console shows it even if CloudKit is the
        // thing that is broken.
        print("[AppEvent] \(name.rawValue): \(message)\(context.map { " | \($0)" } ?? "")")

        guard !isDisabled else { return }

        queue.async {
            let record = CKRecord(recordType: recordType)
            record[Keys.name] = name.rawValue
            record[Keys.message] = String(message.prefix(1000))
            if let context { record[Keys.context] = String(context.prefix(1000)) }
            record[Keys.timestamp] = Date()
            record[Keys.systemVersion] = systemVersion
            record[Keys.deviceModel] = deviceModel
            record[Keys.appVersion] = appVersion

            container.privateCloudDatabase.save(record) { _, error in
                if let error {
                    // Do not recurse into record(): that would loop.
                    print("[AppEvent] could not write event: \(error.localizedDescription)")
                    let ns = error as NSError
                    // Permanent failures (no account, missing entitlement,
                    // schema not deployed) will not recover this run.
                    if ns.domain == CKErrorDomain,
                       let code = CKError.Code(rawValue: ns.code),
                       code == .notAuthenticated || code == .permissionFailure
                        || code == .badContainer || code == .invalidArguments {
                        isDisabled = true
                        print("[AppEvent] disabling event log for this session")
                    }
                }
            }
        }
    }

    /// Convenience for the common case of logging a caught error.
    static func record(_ name: Name, error: Error, context: String? = nil) {
        let ns = error as NSError
        record(name,
               message: "\(ns.localizedDescription) [\(ns.domain) \(ns.code)]",
               context: context)
    }
}
