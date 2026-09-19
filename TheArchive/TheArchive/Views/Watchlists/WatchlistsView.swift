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

    private var sidebar: some View {
        VStack(alignment: .leading, spacing: 0) {
            Button {
                showNewListInput = true
            } label: {
                Label("New List", systemImage: "plus")
                    .font(ArchiveTheme.monoFont(size: 16))
                    .foregroundColor(ArchiveTheme.accent)
            }
            .padding(20)

            Rectangle()
                .fill(ArchiveTheme.border)
                .frame(height: 1)

            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(watchlistVM.watchlists) { list in
                        // A plain Button rather than List selection: outside a
                        // split view, List's selection binding does not drive
                        // the detail pane on tvOS.
                        Button {
                            watchlistVM.selectedListID = list.id
                        } label: {
                            Text(list.name)
                                .font(ArchiveTheme.bodyFont(size: 18))
                                .foregroundColor(watchlistVM.selectedListID == list.id
                                                 ? ArchiveTheme.accent
                                                 : ArchiveTheme.textPrimary)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(.horizontal, 20)
                                .padding(.vertical, 14)
                        }
                        .buttonStyle(.plain)
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
    }

    private var detailPane: some View {
        Group {
            if let list = watchlistVM.selectedList {
                let items = libraryVM.items.filter { list.itemIDs.contains($0.iTunesID) }
                if items.isEmpty {
                    Text("No titles in this list yet.\nAdd them from the Library.")
                        .font(ArchiveTheme.monoFont(size: 18))
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
                }
            } else {
                Text("Select a list")
                    .font(ArchiveTheme.monoFont(size: 18))
                    .foregroundColor(ArchiveTheme.textMuted)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
    }

    // MARK: - Actions

    private func createList() {
        let name = newListName.trimmingCharacters(in: .whitespaces)
        guard !name.isEmpty else { return }
        let list = Watchlist(id: UUID().uuidString, name: name, itemIDs: [])
        watchlistVM.watchlists.append(list)
        Task { try? await ck.saveWatchlist(list) }
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
