import SwiftUI

struct GenrePillsView: View {
    let genres: [String]
    @Binding var selected: String?

    /// Which pill has focus. The genre applies on focus, so moving across the
    /// row filters the grid with no separate click. "All Genres" is nil in the
    /// binding, so it uses a sentinel here to stay distinct from "no focus".
    private static let allGenresToken = "\u{0}all-genres"
    @FocusState private var focusedPill: String?

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            // Generous spacing: focused pills scale up slightly, so tight
            // gaps make neighbours look like they are being clipped.
            HStack(spacing: 18) {
                pill(label: "All Genres", value: nil)
                ForEach(genres, id: \.self) { genre in
                    pill(label: genre, value: genre)
                }
            }
            .padding(.horizontal, 40)
            .padding(.vertical, 8)
            .onChange(of: focusedPill) { _, token in
                guard let token else { return }
                selected = token == Self.allGenresToken ? nil : token
            }
        }
    }

    @ViewBuilder
    private func pill(label: String, value: String?) -> some View {
        let isActive = selected == value
        // A plain Button gets the default tvOS focus highlight, a bright
        // system-yellow box that clashes badly with the sepia palette.
        // ArchiveFocusButtonStyle substitutes a gold border and a small lift.
        Button {
            selected = value
        } label: {
            Text(label)
                .font(ArchiveTheme.monoFont(size: 18))
                .kerning(1)
                .foregroundColor(isActive ? ArchiveTheme.accent : ArchiveTheme.textMuted)
                .padding(.horizontal, 20)
                .padding(.vertical, 11)
                .background(isActive ? ArchiveTheme.accent.opacity(0.12) : Color.clear)
                .overlay(
                    RoundedRectangle(cornerRadius: 4)
                        .stroke(isActive ? ArchiveTheme.accent.opacity(0.7) : ArchiveTheme.border,
                                lineWidth: 1)
                )
        }
        .buttonStyle(ArchiveFocusButtonStyle())
        .focused($focusedPill, equals: value ?? Self.allGenresToken)
        .accessibilityAddTraits(isActive ? .isSelected : [])
    }
}
