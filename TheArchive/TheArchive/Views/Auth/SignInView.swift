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

                // Sign in button
                SignInWithAppleButton(.signIn) { request in
                    request.requestedScopes = [.fullName]
                } onCompletion: { result in
                    auth.handleAuthorization(result: result)
                }
                .frame(width: 400, height: 64)
                .signInWithAppleButtonStyle(.white)

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
