import SwiftUI
import AuthenticationServices

struct SignInView: View {
    @EnvironmentObject var auth: AuthService

    var body: some View {
        ZStack {
            ArchiveTheme.background.ignoresSafeArea()

            VStack(spacing: 40) {
                // Logo
                VStack(spacing: 8) {
                    Text("The Archive")
                        .font(ArchiveTheme.titleFont(size: 56))
                        .foregroundColor(ArchiveTheme.accent)
                    Text("YOUR PERSONAL COLLECTION")
                        .font(ArchiveTheme.monoFont(size: 16))
                        .foregroundColor(ArchiveTheme.textMuted)
                        .kerning(4)
                }

                // A plain Button driving ASAuthorizationController directly.
                // SwiftUI's SignInWithAppleButton does not work on tvOS: the
                // sheet flickers and dismisses, and neither callback fires.
                Button {
                    auth.startSignIn()
                } label: {
                    HStack(spacing: 10) {
                        Image(systemName: "applelogo")
                        Text("Sign in with Apple")
                    }
                    .font(ArchiveTheme.bodyFont(size: 22).weight(.bold))
                    .foregroundColor(.black)
                    .frame(width: 400, height: 64)
                    .background(Color.white)
                    .cornerRadius(8)
                }
                .buttonStyle(.plain)

                if let authError = auth.authError {
                    Text(authError)
                        .font(ArchiveTheme.monoFont(size: 14))
                        .foregroundColor(ArchiveTheme.accent2)
                        .multilineTextAlignment(.center)
                        .frame(maxWidth: 700)
                }

                #if DEBUG && targetEnvironment(simulator)
                Button("Skip Sign-In (DEBUG)") {
                    auth.isSignedIn = true
                }
                .font(ArchiveTheme.monoFont(size: 16))
                .foregroundColor(ArchiveTheme.textMuted)
                #endif
            }
        }
    }
}
