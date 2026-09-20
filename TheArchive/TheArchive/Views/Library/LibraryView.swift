import SwiftUI

struct LibraryView: View {
    @EnvironmentObject var libraryVM: LibraryViewModel
    @EnvironmentObject var auth: AuthService
    @State private var showSignOutConfirm = false

    /// Focus targets in the toolbar. tvOS moves focus to whichever control is
    /// horizontally nearest, so coming down from the tab bar used to land on
    /// Sort or Account on the right rather than the type filter on the left.
    private enum ToolbarFocus: Hashable { case typeFilter }
    @FocusState private var toolbarFocus: ToolbarFocus?
    @Namespace private var libraryFocus

    private let columns = [GridItem(.adaptive(minimum: 220), spacing: 16)]

    var body: some View {
        NavigationStack {
            ZStack(alignment: .top) {
                ArchiveTheme.background.ignoresSafeArea()

                VStack(spacing: 0) {
                    // Toolbar. focusSection makes the whole row a single focus
                    // target, so moving down from the tab bar enters it at the
                    // preferred control rather than the horizontally nearest
                    // one, which was Account on the far right.
                    toolbar
                        .focusSection()

                    // Genre pills, their own focus section so moving down from
                    // the toolbar enters the row from the left rather than
                    // jumping to whichever pill happens to line up.
                    GenrePillsView(genres: libraryVM.computedGenrePills,
                                   selected: $libraryVM.selectedGenre)
                        .padding(.vertical, 10)
                        .focusSection()

                    // Offline banner
                    if libraryVM.isOffline {
                        offlineBanner
                    }

                    // Grid
                    if libraryVM.isLoading {
                        Spacer()
                        ProgressView()
                            .progressViewStyle(.circular)
                            .tint(ArchiveTheme.accent)
                        Spacer()
                    } else if libraryVM.filteredItems.isEmpty {
                        emptyState
                    } else {
                        ScrollView {
                            LazyVGrid(columns: columns, spacing: 24) {
                                ForEach(libraryVM.filteredItems) { item in
                                    NavigationLink(value: item) {
                                        PosterCardView(item: item)
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                            .padding(40)
                        }
                    }
                }
            }
            .navigationDestination(for: LibraryItem.self) { item in
                DetailSheetView(item: item)
            }
        }
        .alert("Sign Out", isPresented: $showSignOutConfirm) {
            Button("Sign Out", role: .destructive) { auth.signOut() }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Are you sure you want to sign out?")
        }
    }

    // MARK: - Subviews

    private var toolbar: some View {
        HStack(spacing: 20) {
            // Type segmented control
            // Separate buttons rather than a segmented Picker: the segmented
            // style crams its options together and cannot be spaced, and its
            // tvOS focus treatment does not match the rest of the app.
            VStack(alignment: .leading, spacing: 10) {
                // Counts sit above the filter rather than below the genre
                // pills, so the library's size reads first.
                statsBar

                HStack(spacing: 18) {
                    typeButton("All", .all)
                        .prefersDefaultFocus(in: libraryFocus)
                    typeButton("Films", .film)
                    typeButton("Series", .series)
                }
                .focused($toolbarFocus, equals: .typeFilter)
            }

            Spacer()

            // Sort
            Menu {
                Button("A–Z") { libraryVM.sortOrder = .az }
                Button("Z–A") { libraryVM.sortOrder = .za }
                Button("Year: Newest") { libraryVM.sortOrder = .yearNewest }
                Button("Year: Oldest") { libraryVM.sortOrder = .yearOldest }
                Button("Newest Added") { libraryVM.sortOrder = .newestAdded }
            } label: {
                Label("Sort", systemImage: "arrow.up.arrow.down")
                    .font(ArchiveTheme.monoFont(size: 14))
                    .foregroundColor(ArchiveTheme.textMuted)
            }

            // Account
            Button {
                showSignOutConfirm = true
            } label: {
                Image(systemName: "person.circle")
                    .font(.system(size: 24))
                    .foregroundColor(ArchiveTheme.textMuted)
            }
            .accessibilityLabel("Account")
        }
        .padding(.horizontal, 40)
        .padding(.vertical, 16)
    }

    /// One option in the type filter. Focus is shown by a gold border rather
    /// than the tvOS default highlight, matching the genre pills below.
    @ViewBuilder
    private func typeButton(_ label: String, _ filter: TypeFilter) -> some View {
        let isActive = libraryVM.typeFilter == filter
        Button {
            libraryVM.typeFilter = filter
        } label: {
            Text(label)
                .font(ArchiveTheme.monoFont(size: 18))
                .kerning(2)
                .foregroundColor(isActive ? ArchiveTheme.accent : ArchiveTheme.textMuted)
                .padding(.horizontal, 24)
                .padding(.vertical, 12)
                .background(isActive ? ArchiveTheme.accent.opacity(0.12) : Color.clear)
                .overlay(
                    RoundedRectangle(cornerRadius: 4)
                        .stroke(isActive ? ArchiveTheme.accent.opacity(0.7) : ArchiveTheme.border,
                                lineWidth: 1)
                )
        }
        .buttonStyle(ArchiveFocusButtonStyle())
        .accessibilityAddTraits(isActive ? .isSelected : [])
    }

    private var statsBar: some View {
        HStack(spacing: 24) {
            statItem(value: "\(libraryVM.filteredItems.filter { $0.type == .film }.count)", label: "FILMS")
            statItem(value: "\(libraryVM.filteredItems.filter { $0.type == .series }.count)", label: "SERIES")
        }
    }

    private func statItem(value: String, label: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
            Text(value)
                .font(ArchiveTheme.monoFont(size: 24).weight(.bold))
                .foregroundColor(ArchiveTheme.accent)
            Text(label)
                .font(ArchiveTheme.monoFont(size: 15))
                .foregroundColor(ArchiveTheme.textMuted)
                .kerning(2)
        }
    }

    private var offlineBanner: some View {
        HStack {
            Image(systemName: "wifi.slash")
            Text("Offline — changes will sync when connected")
                .font(ArchiveTheme.monoFont(size: 13))
        }
        .foregroundColor(ArchiveTheme.textMuted)
        .frame(maxWidth: .infinity)
        .padding(.vertical, 8)
        .background(ArchiveTheme.surface)
        .overlay(Rectangle().frame(height: 1).foregroundColor(ArchiveTheme.border), alignment: .bottom)
    }

    // A failed load must not render as an empty library: that tells people
    // their titles are gone when the fetch simply did not succeed.
    private var emptyState: some View {
        VStack(spacing: 16) {
            Spacer()
            if let loadError = libraryVM.loadError {
                Text("Couldn't load your library")
                    .font(ArchiveTheme.titleFont(size: 40))
                    .foregroundColor(ArchiveTheme.accent2)
                Text(loadError)
                    .font(ArchiveTheme.monoFont(size: 14))
                    .foregroundColor(ArchiveTheme.textMuted)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: 900)
                Text("YOUR TITLES ARE SAFE — THIS IS A LOADING PROBLEM")
                    .font(ArchiveTheme.monoFont(size: 12))
                    .foregroundColor(ArchiveTheme.textMuted)
                    .kerning(2)
                    .padding(.top, 4)
            } else {
                Text("Nothing here yet")
                    .font(ArchiveTheme.titleFont(size: 40))
                    .foregroundColor(ArchiveTheme.border)
                Text("Head to Search to add your first title.")
                    .font(ArchiveTheme.monoFont(size: 14))
                    .foregroundColor(ArchiveTheme.textMuted)
                    .kerning(3)
            }
            Spacer()
        }
    }
}
