import AuthenticationServices
import Combine
import Security

@MainActor
final class AuthService: NSObject, ObservableObject {
    @Published var isSignedIn: Bool = false
    @Published var userID: String? = nil

    private let keychainService = "deepak-nalla.TheArchive"
    private let keychainAccount = "appleUserID"

    override init() {
        super.init()
        userID = Self.keychainRead(service: keychainService, account: keychainAccount)
        isSignedIn = userID != nil

        #if DEBUG && targetEnvironment(simulator)
        if UIPreviewFlags.isPreviewing {
            isSignedIn = true
        }
        #endif
    }

    // MARK: - Keychain helpers

    private static func keychainRead(service: String, account: String) -> String? {
        let query: [CFString: Any] = [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: service,
            kSecAttrAccount: account,
            kSecReturnData: true,
            kSecMatchLimit: kSecMatchLimitOne
        ]
        var result: AnyObject?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    private static func keychainWrite(service: String, account: String, value: String) {
        let data = Data(value.utf8)
        let query: [CFString: Any] = [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: service,
            kSecAttrAccount: account
        ]
        let attributes: [CFString: Any] = [kSecValueData: data]
        if SecItemUpdate(query as CFDictionary, attributes as CFDictionary) == errSecItemNotFound {
            var newItem = query
            newItem[kSecValueData] = data
            SecItemAdd(newItem as CFDictionary, nil)
        }
    }

    private static func keychainDelete(service: String, account: String) {
        let query: [CFString: Any] = [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: service,
            kSecAttrAccount: account
        ]
        SecItemDelete(query as CFDictionary)
    }

    // Called on each app foreground — checks credential is still valid
    func checkCredentialState() async {
        #if DEBUG && targetEnvironment(simulator)
        // The preview bypass sets isSignedIn without a userID, so the guard
        // below would sign the app back out on the first foreground.
        if UIPreviewFlags.isPreviewing { return }
        #endif

        guard let userID else {
            isSignedIn = false
            return
        }
        let provider = ASAuthorizationAppleIDProvider()
        do {
            let state = try await provider.credentialState(forUserID: userID)
            await MainActor.run {
                isSignedIn = (state == .authorized)
                if !isSignedIn { clearSession() }
            }
        } catch {
            await MainActor.run { isSignedIn = false }
        }
    }

    /// Set when sign-in fails, so the UI can say what went wrong instead of
    /// appearing to do nothing.
    @Published var authError: String? = nil

    func handleAuthorization(result: Result<ASAuthorization, Error>) {
        switch result {
        case .success(let auth):
            guard let credential = auth.credential as? ASAuthorizationAppleIDCredential else {
                let kind = String(describing: type(of: auth.credential))
                print("[Auth] Unexpected credential type: \(kind)")
                AppEventLog.record(.authUnexpectedCredential, message: kind)
                authError = "Unexpected credential type: \(kind)"
                return
            }
            print("[Auth] Success. user=\(credential.user)")
            AppEventLog.record(.authSuccess, message: "signed in")
            Self.keychainWrite(service: keychainService, account: keychainAccount, value: credential.user)
            userID = credential.user
            isSignedIn = true
            authError = nil

        case .failure(let error):
            // ASAuthorizationError.canceled (1001) is the usual "nothing
            // happened" case: the sheet failed to present or was dismissed.
            let ns = error as NSError
            print("[Auth] Failed: domain=\(ns.domain) code=\(ns.code) \(ns.localizedDescription)")
            if let code = ASAuthorizationError.Code(rawValue: ns.code) {
                print("[Auth] ASAuthorizationError: \(code)")
            }
            AppEventLog.record(.authFailure, error: error)
            authError = "\(ns.localizedDescription) (code \(ns.code))"
            isSignedIn = false
        }
    }

    func signOut() {
        clearSession()
    }

    private func clearSession() {
        Self.keychainDelete(service: keychainService, account: keychainAccount)
        userID = nil
        isSignedIn = false
    }
}
