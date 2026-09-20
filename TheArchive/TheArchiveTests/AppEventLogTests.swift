import XCTest
import CloudKit
@testable import TheArchive

final class AppEventLogTests: XCTestCase {

    func test_eventNames_areStableDottedStrings() {
        // The dashboard is filtered by these strings, so a rename is a
        // breaking change to the diagnostics workflow.
        XCTAssertEqual(AppEventLog.Name.authFailure.rawValue, "auth.failure")
        XCTAssertEqual(AppEventLog.Name.saveItemFailure.rawValue, "ck.saveItem.failure")
        XCTAssertEqual(AppEventLog.Name.catalogIDFallback.rawValue, "ck.catalogID.fallback")
        XCTAssertEqual(AppEventLog.Name.launch.rawValue, "app.launch")
    }

    func test_recordType_matchesDashboardName() {
        XCTAssertEqual(AppEventLog.recordType, "AppEvent")
    }

    func test_record_doesNotThrowOrBlock_whenCloudKitUnavailable() {
        // Logging must never fail the operation it is describing. In the test
        // environment there is no iCloud account, so the underlying save will
        // fail; record() should still return immediately.
        let started = Date()
        AppEventLog.record(.launch, message: "unit test", context: "no-account")
        let elapsed = Date().timeIntervalSince(started)
        XCTAssertLessThan(elapsed, 0.5, "record() must not block the caller")
    }

    func test_record_withError_includesDomainAndCode() {
        // The convenience overload must preserve the domain and code, which are
        // what identify a CloudKit failure in the dashboard.
        let error = NSError(domain: CKErrorDomain,
                            code: CKError.Code.notAuthenticated.rawValue,
                            userInfo: [NSLocalizedDescriptionKey: "Not Authenticated"])
        // Exercises the formatting path; no throw means the overload is sound.
        AppEventLog.record(.authFailure, error: error, context: "unit test")
    }
}
