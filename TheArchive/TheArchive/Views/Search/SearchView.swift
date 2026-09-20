import SwiftUI

struct SearchView: View {
    @EnvironmentObject var searchVM: SearchViewModel
    @EnvironmentObject var libraryVM: LibraryViewModel
    @EnvironmentObject var ck: CloudKitService

    @State private var pendingResult: iTunesResult? = nil
    @State private var showDuplicateAlert = false
    @State private var duplicateTitle = ""

    /// Drives the search field's focused appearance, so it fills with gold
    /// rather than the system white when the keyboard is up.
    @FocusState private var searchFieldFocused: Bool

    private let columns = [GridItem(.adaptive(minimum: 220), spacing: 16)]

    var body: some View {
        ZStack {
            ArchiveTheme.background.ignoresSafeArea()

            // Branding sits behind the content, centred in the space the
            // results grid will eventually fill. It fades out once there are
            // results so it never competes with the posters.
            ArchiveWordmark(titleSize: 92, taglineSize: 24, alignment: .center)
                .opacity(searchVM.results.isEmpty ? 0.22 : 0)
                .animation(.easeOut(duration: 0.3), value: searchVM.results.isEmpty)
                .allowsHitTesting(false)

            VStack(spacing: 0) {
                // Search bar
                // .plain strips the tvOS default, which paints an opaque white
                // capsule over any background set on the field and ignores the
                // app's palette entirely. The focused fill is a muted gold
                // rather than the system white.
                TextField("Search films and TV shows…", text: $searchVM.query)
                    .textFieldStyle(.plain)
                    .font(ArchiveTheme.bodyFont(size: 26))
                    .foregroundColor(searchFieldFocused ? .black : ArchiveTheme.textPrimary)
                    .tint(ArchiveTheme.accent)
                    .focused($searchFieldFocused)
                    .padding(.horizontal, 24)
                    .padding(.vertical, 20)
                    .background(searchFieldFocused
                                ? ArchiveTheme.accent.opacity(0.85)
                                : ArchiveTheme.surface)
                    .overlay(
                        RoundedRectangle(cornerRadius: 6)
                            .stroke(ArchiveTheme.accent.opacity(0.7), lineWidth: 2)
                    )
                    .padding(.horizontal, 40)
                    .padding(.top, 20)
                    .onSubmit {
                        Task { await searchVM.search(existingIDs: Set(libraryVM.items.map(\.iTunesID))) }
                    }

                // Error / empty state
                if let error = searchVM.errorMessage {
                    Text(error)
                        .font(ArchiveTheme.monoFont(size: 16))
                        .foregroundColor(ArchiveTheme.textMuted)
                        .padding(40)
                    Spacer()
                } else if searchVM.isSearching {
                    Spacer()
                    ProgressView().tint(ArchiveTheme.accent)
                    Spacer()
                } else {
                    ScrollView {
                        LazyVGrid(columns: columns, spacing: 24) {
                            ForEach(searchVM.results) { result in
                                Button { confirmAdd(result) } label: {
                                    searchCard(result)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                        .padding(40)
                    }
                }
            }
        }
        .alert("Add to Library", isPresented: Binding(get: { pendingResult != nil }, set: { if !$0 { pendingResult = nil } })) {
            Button("Add") {
                if let r = pendingResult { Task { await addItem(r) } }
                pendingResult = nil
            }
            Button("Cancel", role: .cancel) { pendingResult = nil }
        } message: {
            Text("Add \"\(pendingResult?.title ?? "")\" to your library?")
        }
        .alert("Already in Library", isPresented: $showDuplicateAlert) {
            Button("OK", role: .cancel) {}
        } message: {
            Text("\"\(duplicateTitle)\" is already in your library.")
        }
    }

    private func searchCard(_ result: iTunesResult) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            AsyncImage(url: URL(string: result.artworkURL)) { phase in
                if let img = phase.image {
                    img.resizable().scaledToFill()
                } else {
                    ArchiveTheme.posterGradient(for: result.title)
                }
            }
            .frame(width: 220, height: 330)
            .clipped()
            .cornerRadius(6)
            .overlay(RoundedRectangle(cornerRadius: 6).stroke(ArchiveTheme.border, lineWidth: 1))

            VStack(alignment: .leading, spacing: 4) {
                Text(result.title)
                    .font(ArchiveTheme.bodyFont(size: 16))
                    .foregroundColor(ArchiveTheme.textPrimary)
                    .lineLimit(2)
                Text(result.type == .film ? "\(result.yearText) · FILM" : "SERIES · \(result.yearText)")
                    .font(ArchiveTheme.monoFont(size: 12))
                    .foregroundColor(ArchiveTheme.textMuted)
            }
            .padding(.top, 8)
            .frame(width: 220, alignment: .leading)
        }
    }

    private func confirmAdd(_ result: iTunesResult) {
        let existingIDs = Set(libraryVM.items.map(\.iTunesID))
        if SearchViewModel.isDuplicate(iTunesID: result.id, existingIDs: existingIDs) {
            duplicateTitle = result.title
            showDuplicateAlert = true
        } else {
            pendingResult = result
        }
    }

    private func addItem(_ result: iTunesResult) async {
        let catalogID = await ck.nextCatalogID(type: result.type)
        let item = LibraryItem(
            id: UUID().uuidString,
            catalogID: catalogID,
            iTunesID: result.id,
            title: result.title,
            year: result.year,
            type: result.type,
            artworkURL: result.artworkURL,
            genres: [],
            watched: false,
            dateAdded: Date()
        )
        // Keep whatever the save returns: on success it carries the server
        // record, so later edits are updates rather than rejected inserts.
        let stored = (try? await ck.saveItem(item)) ?? item
        await MainActor.run { libraryVM.items.append(stored) }
    }
}
