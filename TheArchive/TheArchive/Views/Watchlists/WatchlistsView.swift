import SwiftUI

struct WatchlistsView: View {
    @EnvironmentObject var watchlistVM: WatchlistViewModel
    @EnvironmentObject var libraryVM: LibraryViewModel
    @EnvironmentObject var ck: CloudKitService

    @State private var newListName = ""
    @State private var showNewListInput = false
    @State private var listToRename: Watchlist? = nil
    @State private var renameText = ""
    @State private var listToDelete: Watchlist? = nil
    @State private var showAddTitles = false

    /// Which sidebar row currently has focus. Selection follows focus, so
    /// scrolling the list updates the detail pane without a separate click.
    @FocusState private var focusedListID: String?

    private let columns = [GridItem(.adaptive(minimum: 220), spacing: 16)]

    /// Wide enough for the longest expected list name at 18pt Courier Prime.
    private let sidebarWidth: CGFloat = 420

    var body: some View {
        ZStack {
            ArchiveTheme.background.ignoresSafeArea()

            if watchlistVM.watchlists.isEmpty {
                // Empty state with prominent create button
                VStack(spacing: 24) {
                    Text("No Lists Yet")
                        .font(ArchiveTheme.titleFont(size: 36))
                        .foregroundColor(ArchiveTheme.textMuted)
                    Text("Create a list to organize your library.")
                        .font(ArchiveTheme.monoFont(size: 18))
                        .foregroundColor(ArchiveTheme.textMuted)
                    Button {
                        showNewListInput = true
                    } label: {
                        Label("New List", systemImage: "plus")
                            .font(ArchiveTheme.bodyFont(size: 20).weight(.bold))
                            .foregroundColor(.black)
                            .padding(.horizontal, 32)
                            .padding(.vertical, 16)
                            .background(ArchiveTheme.accent)
                            .cornerRadius(6)
                    }
                }
            } else {
                // An explicit HStack rather than NavigationSplitView. The split
                // view laid the detail grid out against the full screen width
                // instead of the detail column, so the first poster column
                // rendered underneath the sidebar. Fixed widths make the
                // geometry unambiguous.
                NavigationStack {
                    HStack(spacing: 0) {
                        sidebar
                            .frame(width: sidebarWidth)
                            .background(ArchiveTheme.surface)

                        Rectangle()
                            .fill(ArchiveTheme.border)
                            .frame(width: 1)

                        detailPane
                            .frame(maxWidth: .infinity, maxHeight: .infinity)
                    }
                    .navigationDestination(for: LibraryItem.self) { item in
                        DetailSheetView(item: item)
                    }
                }
            }
        }
        .fullScreenCover(isPresented: $showAddTitles) {
            addTitlesSheet
        }
        .alert("New List", isPresented: $showNewListInput) {
            TextField("List name", text: $newListName)
            Button("Create") { createList() }
            Button("Cancel", role: .cancel) { newListName = "" }
        }
        .alert("Rename List", isPresented: Binding(get: { listToRename != nil }, set: { if !$0 { listToRename = nil } })) {
            TextField("New name", text: $renameText)
            Button("Rename") { renameList() }
            Button("Cancel", role: .cancel) { listToRename = nil }
        }
        .alert("Delete List", isPresented: Binding(get: { listToDelete != nil }, set: { if !$0 { listToDelete = nil } })) {
            Button("Delete", role: .destructive) { deleteList() }
            Button("Cancel", role: .cancel) { listToDelete = nil }
        } message: {
            Text("Delete \"\(listToDelete?.name ?? "")\"? This cannot be undone.")
        }
    }

    // MARK: - Panes

    /// Shared styling for the buttons beside a list's name.
    private func headerButtonLabel(_ title: String, icon: String,
                                   tint: Color = ArchiveTheme.accent) -> some View {
        Label(title, systemImage: icon)
            .font(ArchiveTheme.monoFont(size: 20))
            .foregroundColor(tint)
            .padding(.horizontal, 18)
            .padding(.vertical, 12)
            .overlay(
                RoundedRectangle(cornerRadius: 4)
                    .strokeBorder(ArchiveTheme.border, lineWidth: 1)
            )
    }

    private var sidebar: some View {
        VStack(alignment: .leading, spacing: 0) {
            Button {
                showNewListInput = true
            } label: {
                Label("New List", systemImage: "plus")
                    .font(ArchiveTheme.monoFont(size: 22))
                    .foregroundColor(ArchiveTheme.accent)
                    .padding(.horizontal, 18)
                    .padding(.vertical, 12)
            }
            .buttonStyle(ArchiveFocusButtonStyle())
            .padding(.horizontal, 14)
            .padding(.vertical, 16)

            Rectangle()
                .fill(ArchiveTheme.border)
                .frame(height: 1)

            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(watchlistVM.watchlists) { list in
                        // A plain Button rather than List selection: outside a
                        // split view, List's selection binding does not drive
                        // the detail pane on tvOS.
                        let isSelected = watchlistVM.selectedListID == list.id
                        Button {
                            watchlistVM.selectedListID = list.id
                        } label: {
                            // Fill and border share one shape and one set of
                            // insets, so the selection highlight and the focus
                            // ring sit exactly on top of each other. Padding
                            // between them left a visible gap.
                            Text(list.name)
                                .font(ArchiveTheme.bodyFont(size: 28))
                                .lineLimit(1)
                                .foregroundColor(isSelected
                                                 ? ArchiveTheme.accent
                                                 : ArchiveTheme.textPrimary)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(.horizontal, 18)
                                .padding(.vertical, 12)
                                .background(
                                    RoundedRectangle(cornerRadius: 6)
                                        .fill(isSelected ? ArchiveTheme.accent.opacity(0.12) : Color.clear)
                                )
                                .overlay(
                                    RoundedRectangle(cornerRadius: 6)
                                        .strokeBorder(isSelected ? ArchiveTheme.accent.opacity(0.7) : Color.clear,
                                                      lineWidth: 1)
                                )
                        }
                        .buttonStyle(ArchiveRowFocusStyle())
                        // Spacing lives outside the button so it never appears
                        // between the fill and the border.
                        .padding(.horizontal, 14)
                        .padding(.vertical, 3)
                        // Selecting on focus: scrolling the sidebar changes the
                        // detail pane directly, with no separate click.
                        .focused($focusedListID, equals: list.id)
                        .contextMenu {
                            Button("Rename") {
                                listToRename = list
                                renameText = list.name
                            }
                            Button("Delete", role: .destructive) {
                                listToDelete = list
                            }
                        }
                    }
                }
            }

            Spacer(minLength: 0)
        }
        .frame(maxHeight: .infinity, alignment: .top)
        .onChange(of: focusedListID) { _, id in
            if let id { watchlistVM.selectedListID = id }
        }
    }

    private var detailPane: some View {
        Group {
            if let list = watchlistVM.selectedList {
                let items = libraryVM.items.filter { list.itemIDs.contains($0.iTunesID) }
                VStack(alignment: .leading, spacing: 0) {
                    // Title over a gold rule, matching the slate header on the
                    // detail sheet so the two screens read as one set.
                    VStack(alignment: .leading, spacing: 10) {
                        HStack(alignment: .firstTextBaseline, spacing: 84) {
                            Text(list.name)
                                .font(ArchiveTheme.titleFont(size: 52))
                                .foregroundColor(ArchiveTheme.textPrimary)

                            // These sit beside the title rather than pushed to
                            // the far right: from the first row of posters, up
                            // must reach them, and tvOS moves focus to whatever
                            // is vertically above. Buttons on the opposite edge
                            // of the screen were unreachable that way.
                            HStack(spacing: 16) {
                                Button {
                                    showAddTitles = true
                                } label: {
                                    headerButtonLabel("Add Titles", icon: "plus")
                                }
                                .buttonStyle(ArchiveFocusButtonStyle())

                                // Rename was only reachable by long-pressing a
                                // sidebar row, which is undiscoverable.
                                Button {
                                    listToRename = list
                                    renameText = list.name
                                } label: {
                                    headerButtonLabel("Rename", icon: "pencil")
                                }
                                .buttonStyle(ArchiveFocusButtonStyle())
                                .accessibilityLabel("Rename \(list.name)")

                                // Deleting was also context-menu only. It keeps
                                // its confirmation, and uses the crimson accent
                                // so it reads as destructive without shouting.
                                Button {
                                    listToDelete = list
                                } label: {
                                    headerButtonLabel("Delete", icon: "trash",
                                                      tint: ArchiveTheme.accent2)
                                }
                                .buttonStyle(ArchiveFocusButtonStyle())
                                .accessibilityLabel("Delete \(list.name)")
                            }

                            Spacer(minLength: 0)
                        }
                        Rectangle()
                            .fill(ArchiveTheme.accent)
                            .frame(width: 90, height: 3)
                        Text("\(items.count) \(items.count == 1 ? "TITLE" : "TITLES")")
                            .font(ArchiveTheme.monoFont(size: 15))
                            .foregroundColor(ArchiveTheme.textMuted)
                            .kerning(3)
                    }
                    .padding(.horizontal, 40)
                    .padding(.top, 30)
                    .focusSection()

                    if items.isEmpty {
                        Text("No titles in this list yet.\nUse Add Titles to pick from your library.")
                            .font(ArchiveTheme.monoFont(size: 20))
                            .foregroundColor(ArchiveTheme.textMuted)
                            .multilineTextAlignment(.center)
                            .frame(maxWidth: .infinity, maxHeight: .infinity)
                    } else {
                        ScrollView {
                            LazyVGrid(columns: columns, alignment: .leading, spacing: 24) {
                                ForEach(items) { item in
                                    NavigationLink(value: item) {
                                        PosterCardView(item: item)
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                            .padding(40)
                            .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        // Its own section, so moving up from the first row of
                        // posters leaves the grid and lands in the header.
                        .focusSection()
                    }
                }
            } else {
                Text("Select a list")
                    .font(ArchiveTheme.monoFont(size: 20))
                    .foregroundColor(ArchiveTheme.textMuted)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
    }

    /// Picker listing every library title not already in the selected list.
    /// Tapping one adds it and keeps the sheet open, so several titles can be
    /// added in a row without reopening.
    private var addTitlesSheet: some View {
        ZStack {
            ArchiveTheme.background.ignoresSafeArea()

            VStack(alignment: .leading, spacing: 0) {
                Text("ADD TO \(watchlistVM.selectedList?.name.uppercased() ?? "LIST")")
                    .font(ArchiveTheme.monoFont(size: 20))
                    .foregroundColor(ArchiveTheme.textMuted)
                    .kerning(3)
                    .padding(.horizontal, 60)
                    .padding(.top, 50)
                    .padding(.bottom, 20)

                let candidates = libraryVM.items.filter {
                    !(watchlistVM.selectedList?.itemIDs.contains($0.iTunesID) ?? false)
                }

                if candidates.isEmpty {
                    Text(libraryVM.items.isEmpty
                         ? "Your library is empty. Add titles from Search first."
                         : "Every title in your library is already in this list.")
                        .font(ArchiveTheme.monoFont(size: 20))
                        .foregroundColor(ArchiveTheme.textMuted)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    ScrollView {
                        LazyVGrid(columns: columns, alignment: .leading, spacing: 24) {
                            ForEach(candidates) { item in
                                Button {
                                    addToSelectedList(item)
                                } label: {
                                    PosterCardView(item: item)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                        .padding(.horizontal, 60)
                        .padding(.bottom, 40)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }

                Button("Done") { showAddTitles = false }
                    .font(ArchiveTheme.bodyFont(size: 20))
                    .padding(.horizontal, 60)
                    .padding(.bottom, 40)
            }
        }
    }

    // MARK: - Actions

    /// Adds a library title to the selected watchlist and persists the change.
    private func addToSelectedList(_ item: LibraryItem) {
        guard let list = watchlistVM.selectedList,
              let idx = watchlistVM.watchlists.firstIndex(where: { $0.id == list.id }),
              !list.itemIDs.contains(item.iTunesID) else { return }

        var updated = watchlistVM.watchlists[idx]
        updated.itemIDs.append(item.iTunesID)
        watchlistVM.watchlists[idx] = updated
        Task { await persistList(updated) }
    }

    /// Saves a list and keeps the record CloudKit returns, so a later edit is
    /// an update rather than an insert the server rejects as a duplicate.
    private func persistList(_ list: Watchlist) async {
        guard let saved = try? await ck.saveWatchlist(list) else { return }
        if let i = watchlistVM.watchlists.firstIndex(where: { $0.id == saved.id }) {
            watchlistVM.watchlists[i] = saved
        }
    }

    private func createList() {
        let name = newListName.trimmingCharacters(in: .whitespaces)
        guard !name.isEmpty else { return }
        let list = Watchlist(id: UUID().uuidString, name: name, itemIDs: [])
        watchlistVM.watchlists.append(list)
        Task { await persistList(list) }
        newListName = ""
    }

    private func renameList() {
        guard let list = listToRename,
              let idx = watchlistVM.watchlists.firstIndex(where: { $0.id == list.id }) else { return }
        let name = renameText.trimmingCharacters(in: .whitespaces)
        guard !name.isEmpty else { return }
        var updated = watchlistVM.watchlists[idx]
        updated.name = name
        watchlistVM.watchlists[idx] = updated
        Task { try? await ck.saveWatchlist(updated) }
        listToRename = nil
    }

    private func deleteList() {
        guard let list = listToDelete else { return }
        watchlistVM.watchlists.removeAll { $0.id == list.id }
        if watchlistVM.selectedListID == list.id { watchlistVM.selectedListID = nil }
        Task { try? await ck.deleteWatchlist(list) }
        listToDelete = nil
    }
}
