import SwiftUI

struct PosterCardView: View {
    let item: LibraryItem

    /// Grid cells overlay the catalog ID, genre and title on the artwork. The
    /// detail sheet shows all of that in its own header beside the poster, so it
    /// opts out to avoid displaying each value twice.
    var showsOverlayChrome: Bool = true

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Poster (ports .card-poster + .card-poster-overlay + .card-catalog + .card-genre-tag + .card-poster-title)
            ZStack {
                AsyncImage(url: URL(string: item.artworkURL)) { phase in
                    if let img = phase.image {
                        img.resizable().scaledToFill()
                    } else {
                        ArchiveTheme.posterGradient(for: item.title)
                    }
                }
                .frame(width: 220, height: 330)
                .clipped()

                // Bottom-up gradient so overlaid title is readable (HTML .card-poster-overlay)
                LinearGradient(
                    colors: [Color.black.opacity(0.85), Color.black.opacity(0.15), Color.clear],
                    startPoint: .bottom,
                    endPoint: .top
                )

                if showsOverlayChrome {
                VStack {
                    HStack {
                        // Catalog badge, top-left (HTML .card-catalog)
                        Text(item.catalogID)
                            .font(ArchiveTheme.monoFont(size: 10))
                            .foregroundColor(ArchiveTheme.accent.opacity(0.7))
                            .kerning(2)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 3)
                            .background(Color.black.opacity(0.5))
                        Spacer()
                        // Genre tag, top-right (HTML .card-genre-tag) — show first genre only
                        if let genre = item.genres.first {
                            Text(genre.uppercased())
                                .font(ArchiveTheme.monoFont(size: 9))
                                .foregroundColor(ArchiveTheme.accent)
                                .kerning(2)
                                .padding(.horizontal, 5)
                                .padding(.vertical, 2)
                                .background(Color.black.opacity(0.75))
                                .overlay(Rectangle().stroke(ArchiveTheme.accent.opacity(0.35), lineWidth: 1))
                        }
                    }
                    Spacer()
                    // Overlaid title, bottom-left (HTML .card-poster-title — Playfair italic on poster)
                    HStack {
                        Text(item.title)
                            .font(ArchiveTheme.titleFont(size: 18))
                            .foregroundColor(ArchiveTheme.textPrimary)
                            .lineLimit(2)
                            .shadow(color: .black.opacity(0.8), radius: 4, y: 1)
                        Spacer(minLength: 0)
                    }
                }
                .padding(8)
                }
            }
            .frame(width: 220, height: 330)
            // Clip the ZStack itself. The gradient and badge backgrounds have no
            // frame of their own, so without this they size to the proposal and
            // paint outside the poster box in a wider adaptive grid cell.
            .clipped()
            .overlay(Rectangle().stroke(ArchiveTheme.border, lineWidth: 1))

            // Card body (HTML .card-body + .card-meta + .card-type-dot).
            // Also suppressed in the detail sheet, where the header already
            // states the year and media type.
            if showsOverlayChrome {
            HStack(spacing: 6) {
                Circle()
                    .fill(item.type == .film ? ArchiveTheme.accent : ArchiveTheme.accent2)
                    .frame(width: 6, height: 6)
                Text(item.type == .film ? "\(item.yearText) · FILM" : "SERIES · \(item.yearText)")
                    .font(ArchiveTheme.monoFont(size: 11))
                    .foregroundColor(ArchiveTheme.textMuted)
                    .kerning(2)
            }
            .padding(.horizontal, 8)
            .padding(.top, 10)
            .padding(.bottom, 10)
            .frame(width: 220, alignment: .leading)
            .background(ArchiveTheme.cardBg)
            .overlay(
                Rectangle().frame(height: 1).foregroundColor(ArchiveTheme.border),
                alignment: .top
            )
            }
        }
        // Collapse the card's four Text descendants into one announcement.
        // Without this VoiceOver reads the catalog ID, genre and title instead.
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(item.type == .film ? "Film" : "Series"): \(item.title), \(item.yearText)")
    }
}
