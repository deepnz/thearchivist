import SwiftUI

private let predefinedGenres = [
    "Action","Adventure","Animation","Biography","Comedy","Crime",
    "Documentary","Drama","Fantasy","Horror","Mystery","Romance",
    "Sci-Fi","Thriller","War","Western"
]

struct DetailSheetView: View {
    let item: LibraryItem
    @EnvironmentObject var libraryVM: LibraryViewModel
    @EnvironmentObject var watchlistVM: WatchlistViewModel
    @EnvironmentObject var dataStore: DataStore
    @Environment(\.dismiss) var dismiss

    @State private var currentItem: LibraryItem
    @State private var showRemoveConfirm = false
    @State private var showOpenError = false
    @State private var customGenreInput = ""

    init(item: LibraryItem) {
        self.item = item
        self._currentItem = State(initialValue: item)
    }

    var body: some View {
        ZStack {
            ArchiveTheme.background.ignoresSafeArea()

            HStack(alignment: .top, spacing: 60) {
                // Poster
                PosterCardView(item: currentItem)

                // Details
                ScrollView {
                    VStack(alignment: .leading, spacing: 24) {
                        // Title + meta
                        VStack(alignment: .leading, spacing: 6) {
                            Text(currentItem.title)
                                .font(ArchiveTheme.titleFont(size: 42))
                                .foregroundColor(ArchiveTheme.textPrimary)
                            Text("\(currentItem.year) · \(currentItem.type == .film ? "Motion Picture" : "Television Series")")
                                .font(ArchiveTheme.monoFont(size: 16))
                                .foregroundColor(ArchiveTheme.textMuted)
                            Text(currentItem.catalogID)
                                .font(ArchiveTheme.monoFont(size: 13))
                                .foregroundColor(ArchiveTheme.textMuted)
                                .padding(.top, 2)
                        }

                        divider

                        // Genre chips
                        genreSection

                        divider

                        // Watchlist chips
                        watchlistSection

                        divider

                        // Watched toggle
                        Button {
                            toggleWatched()
                        } label: {
                            Label(currentItem.watched ? "Mark as Unwatched" : "Mark as Watched",
                                  systemImage: currentItem.watched ? "checkmark.circle.fill" : "circle")
                                .font(ArchiveTheme.bodyFont(size: 18))
                                .foregroundColor(currentItem.watched ? ArchiveTheme.accent : ArchiveTheme.textMuted)
                        }

                        // Open in Apple TV
                        Button {
                            openInAppleTV()
                        } label: {
                            Text("Open in Apple TV")
                                .font(ArchiveTheme.bodyFont(size: 20).weight(.bold))
                                .foregroundColor(.black)
                                .frame(maxWidth: 360)
                                .padding(.vertical, 16)
                                .background(ArchiveTheme.accent)
                                .cornerRadius(6)
                        }
                        .accessibilityLabel("Open \(currentItem.title) in Apple TV")

                        // Remove
                        Button("Remove from Library", role: .destructive) {
                            showRemoveConfirm = true
                        }
                        .font(ArchiveTheme.monoFont(size: 14))
                        .foregroundColor(ArchiveTheme.textMuted)
                    }
                    .padding(40)
                }
            }
            .padding(60)
        }
        .alert("Remove from Library", isPresented: $showRemoveConfirm) {
            Button("Remove", role: .destructive) { removeItem() }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Remove \"\(currentItem.title)\" from your library?")
        }
        .alert("Could not open Apple TV app.", isPresented: $showOpenError) {
            Button("OK", role: .cancel) {}
        }
    }

    // MARK: - Subviews

    private var divider: some View {
        Rectangle()
            .fill(ArchiveTheme.border)
            .frame(height: 1)
    }

    private var genreSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("GENRES")
                .font(ArchiveTheme.monoFont(size: 12))
                .foregroundColor(ArchiveTheme.textMuted)
                .kerning(3)

            FlowLayout(spacing: 8) {
                let allGenres = predefinedGenres + currentItem.genres.filter { !predefinedGenres.contains($0) }
                ForEach(allGenres, id: \.self) { genre in
                    genreChip(genre)
                }
            }

            // Custom genre input
            TextField("Custom genre…", text: $customGenreInput)
                .font(ArchiveTheme.monoFont(size: 14))
                .foregroundColor(ArchiveTheme.textPrimary)
                .onSubmit { addCustomGenre() }
        }
    }

    private func genreChip(_ genre: String) -> some View {
        let isSelected = currentItem.genres.contains(genre)
        return Button(genre) { toggleGenre(genre) }
            .font(ArchiveTheme.monoFont(size: 14))
            .foregroundColor(isSelected ? ArchiveTheme.accent : ArchiveTheme.textMuted)
            .padding(.horizontal, 12)
            .padding(.vertical, 5)
            .background(
                RoundedRectangle(cornerRadius: 3)
                    .stroke(isSelected ? ArchiveTheme.accent.opacity(0.6) : ArchiveTheme.border, lineWidth: 1)
                    .background(isSelected ? ArchiveTheme.accent.opacity(0.1) : Color.clear)
            )
            .accessibilityLabel("\(genre), \(isSelected ? "selected" : "unselected")")
            .accessibilityAddTraits(.isToggle)
    }

    private var watchlistSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("WATCHLISTS")
                .font(ArchiveTheme.monoFont(size: 12))
                .foregroundColor(ArchiveTheme.textMuted)
                .kerning(3)

            if watchlistVM.watchlists.isEmpty {
                Text("No lists yet — create one in the Watchlists tab")
                    .font(ArchiveTheme.monoFont(size: 14))
                    .foregroundColor(ArchiveTheme.textMuted)
            } else {
                FlowLayout(spacing: 8) {
                    ForEach(watchlistVM.watchlists) { list in
                        watchlistChip(list)
                    }
                }
            }
        }
    }

    private func watchlistChip(_ list: Watchlist) -> some View {
        let isIn = list.itemIDs.contains(currentItem.iTunesID)
        return Button(list.name) { toggleWatchlist(list) }
            .font(ArchiveTheme.monoFont(size: 14))
            .foregroundColor(isIn ? ArchiveTheme.accent2 : ArchiveTheme.textMuted)
            .padding(.horizontal, 12)
            .padding(.vertical, 5)
            .background(
                RoundedRectangle(cornerRadius: 3)
                    .stroke(isIn ? ArchiveTheme.accent2.opacity(0.6) : ArchiveTheme.border, lineWidth: 1)
                    .background(isIn ? ArchiveTheme.accent2.opacity(0.08) : Color.clear)
            )
            .accessibilityLabel("\(list.name), \(isIn ? "in list" : "not in list")")
            .accessibilityAddTraits(.isToggle)
    }

    // MARK: - Actions

    private func toggleGenre(_ genre: String) {
        var updated = currentItem
        if updated.genres.contains(genre) {
            updated.genres.removeAll { $0 == genre }
        } else {
            updated.genres.append(genre)
        }
        currentItem = updated
        dataStore.saveItem(updated)
    }

    private func addCustomGenre() {
        let val = customGenreInput.trimmingCharacters(in: .whitespaces)
        guard !val.isEmpty, !currentItem.genres.contains(val) else { return }
        var updated = currentItem
        updated.genres.append(val)
        currentItem = updated
        customGenreInput = ""
        dataStore.saveItem(updated)
    }

    private func toggleWatched() {
        var updated = currentItem
        updated.watched.toggle()
        currentItem = updated
        dataStore.saveItem(updated)
    }

    private func toggleWatchlist(_ list: Watchlist) {
        guard let idx = watchlistVM.watchlists.firstIndex(where: { $0.id == list.id }) else { return }
        var updated = watchlistVM.watchlists[idx]
        if updated.itemIDs.contains(currentItem.iTunesID) {
            updated.itemIDs.removeAll { $0 == currentItem.iTunesID }
        } else {
            updated.itemIDs.append(currentItem.iTunesID)
        }
        dataStore.saveWatchlist(updated)
    }

    private func removeItem() {
        dataStore.deleteItem(currentItem)
        dismiss()
    }

    private func openInAppleTV() {
        guard let url = AppleTVLink.directURL(for: currentItem) else {
            showOpenError = true
            return
        }
        Task {
            if await UIApplication.shared.open(url) { return }
            // The direct link couldn't be handled — fall back to a TV-app
            // search for the title so the user still lands on the content.
            if let fallback = AppleTVLink.searchURL(for: currentItem.title),
               await UIApplication.shared.open(fallback) { return }
            showOpenError = true
        }
    }
}

// MARK: - FlowLayout (wrapping HStack for chips)
struct FlowLayout: Layout {
    var spacing: CGFloat = 8
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? .infinity
        var x: CGFloat = 0, y: CGFloat = 0, maxH: CGFloat = 0
        for view in subviews {
            let size = view.sizeThatFits(.unspecified)
            if x + size.width > width { x = 0; y += maxH + spacing; maxH = 0 }
            x += size.width + spacing
            maxH = max(maxH, size.height)
        }
        return CGSize(width: width, height: y + maxH)
    }
    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, maxH: CGFloat = 0
        for view in subviews {
            let size = view.sizeThatFits(.unspecified)
            if x + size.width > bounds.maxX { x = bounds.minX; y += maxH + spacing; maxH = 0 }
            view.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
            x += size.width + spacing
            maxH = max(maxH, size.height)
        }
    }
}
