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

    func handleAuthorization(result: Result<ASAuthorization, Error>) {
        switch result {
        case .success(let auth):
            guard let credential = auth.credential as? ASAuthorizationAppleIDCredential else { return }
            Self.keychainWrite(service: keychainService, account: keychainAccount, value: credential.user)
            userID = credential.user
            isSignedIn = true
        case .failure:
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
