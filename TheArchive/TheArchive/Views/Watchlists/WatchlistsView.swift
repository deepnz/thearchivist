import SwiftUI

struct WatchlistsView: View {
    @EnvironmentObject var watchlistVM: WatchlistViewModel
    @EnvironmentObject var libraryVM: LibraryViewModel
    @EnvironmentObject var dataStore: DataStore

    @State private var newListName = ""
    @State private var showNewListInput = false
    @State private var listToRename: Watchlist? = nil
    @State private var renameText = ""
    @State private var listToDelete: Watchlist? = nil

    private let columns = [GridItem(.adaptive(minimum: 220), spacing: 16)]

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
                NavigationSplitView {
                    ZStack {
                        ArchiveTheme.surface.ignoresSafeArea()
                        VStack(alignment: .leading, spacing: 0) {
                            Button {
                                showNewListInput = true
                            } label: {
                                Label("New List", systemImage: "plus")
                                    .font(ArchiveTheme.monoFont(size: 16))
                                    .foregroundColor(ArchiveTheme.accent)
                            }
                            .padding(20)

                            Divider().background(ArchiveTheme.border)

                            List(watchlistVM.watchlists, selection: $watchlistVM.selectedListID) { list in
                                Text(list.name)
                                    .font(ArchiveTheme.bodyFont(size: 18))
                                    .foregroundColor(watchlistVM.selectedListID == list.id ? ArchiveTheme.accent : ArchiveTheme.textPrimary)
                                    .tag(list.id)
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
                            .listStyle(.plain)
                            .background(ArchiveTheme.surface)
                        }
                    }
                } detail: {
                    ZStack {
                        ArchiveTheme.background.ignoresSafeArea()
                        if let list = watchlistVM.selectedList {
                            let items = libraryVM.items.filter { list.itemIDs.contains($0.iTunesID) }
                            if items.isEmpty {
                                Text("No titles in this list yet.\nAdd them from the Library.")
                                    .font(ArchiveTheme.monoFont(size: 18))
                                    .foregroundColor(ArchiveTheme.textMuted)
                                    .multilineTextAlignment(.center)
                            } else {
                                ScrollView {
                                    LazyVGrid(columns: columns, spacing: 24) {
                                        ForEach(items) { item in
                                            NavigationLink(value: item) {
                                                PosterCardView(item: item)
                                            }
                                            .buttonStyle(.card)
                                        }
                                    }
                                    .padding(40)
                                }
                            }
                        } else {
                            Text("Select a list")
                                .font(ArchiveTheme.monoFont(size: 18))
                                .foregroundColor(ArchiveTheme.textMuted)
                        }
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

    private func createList() {
        let name = newListName.trimmingCharacters(in: .whitespaces)
        guard !name.isEmpty else { return }
        let list = Watchlist(id: UUID().uuidString, name: name, itemIDs: [])
        dataStore.saveWatchlist(list)
        newListName = ""
    }

    private func renameList() {
        guard let list = listToRename,
              let idx = watchlistVM.watchlists.firstIndex(where: { $0.id == list.id }) else { return }
        let name = renameText.trimmingCharacters(in: .whitespaces)
        guard !name.isEmpty else { return }
        var updated = watchlistVM.watchlists[idx]
        updated.name = name
        dataStore.saveWatchlist(updated)
        listToRename = nil
    }

    private func deleteList() {
        guard let list = listToDelete else { return }
        dataStore.deleteWatchlist(list)
        listToDelete = nil
    }
}
