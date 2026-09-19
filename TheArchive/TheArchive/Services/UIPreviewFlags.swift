#if DEBUG && targetEnvironment(simulator)
import Foundation

/// Launch flags used only for simulator screenshot and layout passes.
///
/// Sign in with Apple cannot complete in the simulator, so `-uiPreview` starts
/// the app past the sign-in gate. `-uiPreviewTab <n>` additionally opens a
/// specific tab. Centralised here because the two spellings previously lived in
/// separate files and drifted: passing only `-uiPreviewTab` left the app stuck
/// on the sign-in screen.
enum UIPreviewFlags {
    static let previewArg = "-uiPreview"
    static let tabArg = "-uiPreviewTab"

    private static var arguments: [String] { ProcessInfo.processInfo.arguments }

    /// True when either flag is present, so `-uiPreviewTab` alone also works.
    static var isPreviewing: Bool {
        arguments.contains(previewArg) || arguments.contains(tabArg)
    }

    /// The tab index requested via `-uiPreviewTab <n>`, if any.
    static var requestedTab: Int? {
        guard let i = arguments.firstIndex(of: tabArg), i + 1 < arguments.count else { return nil }
        return Int(arguments[i + 1])
    }
}
#endif
