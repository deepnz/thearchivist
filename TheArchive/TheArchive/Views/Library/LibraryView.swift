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

    /// Which type option has focus. The filter applies on focus, so moving
    /// across All / Films / Series updates the grid with no separate click.
    @FocusState private var focusedType: TypeFilter?

    private let columns = [GridItem(.adaptive(minimum: 220), spacing: 16)]

    var body: some View {
        NavigationStack {
            ZStack(alignment: .top) {
                ArchiveTheme.background.ignoresSafeArea()

                // The scorecard sits in the empty space to the left of the
                // system tab bar, which is centred and leaves both flanks
                // unused. It is not focusable, so occupying that band costs
                // nothing in navigation.
                statsBar
                    .padding(.leading, 60)
                    .offset(y: -118)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .allowsHitTesting(false)

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
            VStack(alignment: .leading, spacing: 18) {
                HStack(spacing: 18) {
                    typeButton("All", .all)
                        .prefersDefaultFocus(in: libraryFocus)
                    typeButton("Films", .film)
                    typeButton("Series", .series)
                }
                .focused($toolbarFocus, equals: .typeFilter)
                .onChange(of: focusedType) { _, filter in
                    guard let filter else { return }
                    libraryVM.typeFilter = filter
                    // Switching type rebuilds the genre list, so a genre that
                    // no longer exists would filter the grid down to nothing
                    // with no visible pill to clear it.
                    if let genre = libraryVM.selectedGenre,
                       !libraryVM.computedGenrePills.contains(genre) {
                        libraryVM.selectedGenre = nil
                    }
                }
            }

            Spacer()

            // Sort. Both controls are real: sort drives the grid order and the
            // account button opens sign-out. They previously used unstyled
            // system defaults, which read as stray chrome next to the themed
            // filters, so they now carry the same border and focus treatment
            // and name the current sort rather than just saying "Sort".
            Menu {
                Button("A–Z") { libraryVM.sortOrder = .az }
                Button("Z–A") { libraryVM.sortOrder = .za }
                Button("Year: Newest") { libraryVM.sortOrder = .yearNewest }
                Button("Year: Oldest") { libraryVM.sortOrder = .yearOldest }
                Button("Newest Added") { libraryVM.sortOrder = .newestAdded }
            } label: {
                HStack(spacing: 10) {
                    Image(systemName: "arrow.up.arrow.down")
                        .font(.system(size: 16))
                    Text(sortLabel)
                        .font(ArchiveTheme.monoFont(size: 18))
                        .kerning(2)
                }
                .foregroundColor(ArchiveTheme.textMuted)
                .padding(.horizontal, 22)
                .padding(.vertical, 12)
                .overlay(
                    RoundedRectangle(cornerRadius: 4)
                        .strokeBorder(ArchiveTheme.border, lineWidth: 1)
                )
            }
            .buttonStyle(ArchiveFocusButtonStyle())
            .accessibilityLabel("Sort by \(sortLabel)")

            // Account
            Button {
                showSignOutConfirm = true
            } label: {
                Image(systemName: "person.circle")
                    .font(.system(size: 22))
                    .foregroundColor(ArchiveTheme.textMuted)
                    .padding(.horizontal, 18)
                    .padding(.vertical, 12)
                    .overlay(
                        RoundedRectangle(cornerRadius: 4)
                            .strokeBorder(ArchiveTheme.border, lineWidth: 1)
                    )
            }
            .buttonStyle(ArchiveFocusButtonStyle())
            .accessibilityLabel("Account and sign out")
        }
        .padding(.horizontal, 40)
        // Extra headroom so the filter row clears the scorecard overlaid above
        // it rather than crowding directly underneath.
        .padding(.top, 52)
        .padding(.bottom, 16)
    }

    /// One option in the type filter. Focus is shown by a gold border rather
    /// than the tvOS default highlight, matching the genre pills below.
    ///
    /// The filter applies on focus, so moving across the options updates the
    /// grid immediately without a separate click.
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
        .focused($focusedType, equals: filter)
        .accessibilityAddTraits(isActive ? .isSelected : [])
    }

    /// The active sort, named on the button so the current order is visible
    /// without opening the menu.
    private var sortLabel: String {
        switch libraryVM.sortOrder {
        case .az:          return "A–Z"
        case .za:          return "Z–A"
        case .yearNewest:  return "NEWEST"
        case .yearOldest:  return "OLDEST"
        case .newestAdded: return "RECENT"
        }
    }

    /// Scorecard: large Playfair italic numerals over letterspaced Courier
    /// labels, separated by a thin rule. Playfair Display is the display face
    /// used for titles throughout, so the counts read as part of the same set
    /// rather than as UI chrome.
    private var statsBar: some View {
        HStack(spacing: 40) {
            statItem(value: libraryVM.filteredItems.filter { $0.type == .film }.count,
                     label: "FILMS")

            Rectangle()
                .fill(ArchiveTheme.border)
                .frame(width: 1, height: 84)

            statItem(value: libraryVM.filteredItems.filter { $0.type == .series }.count,
                     label: "SERIES")
        }
    }

    private func statItem(value: Int, label: String) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(String(value))
                .font(ArchiveTheme.titleFont(size: 92))
                .foregroundColor(ArchiveTheme.accent)
            Text(label)
                .font(ArchiveTheme.monoFont(size: 17))
                .foregroundColor(ArchiveTheme.textMuted)
                .kerning(5)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(value) \(label.lowercased())")
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
