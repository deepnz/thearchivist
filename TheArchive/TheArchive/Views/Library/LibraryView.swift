import SwiftUI

struct LibraryView: View {
    @EnvironmentObject var libraryVM: LibraryViewModel
    @EnvironmentObject var auth: AuthService
    @State private var showSignOutConfirm = false

    private let columns = [GridItem(.adaptive(minimum: 220), spacing: 16)]

    var body: some View {
        NavigationStack {
            ZStack(alignment: .top) {
                ArchiveTheme.background.ignoresSafeArea()

                VStack(spacing: 0) {
                    // Toolbar
                    toolbar

                    // Genre pills
                    GenrePillsView(genres: libraryVM.computedGenrePills,
                                   selected: $libraryVM.selectedGenre)
                        .padding(.vertical, 10)

                    // Stats bar
                    statsBar

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
            Picker("Type", selection: $libraryVM.typeFilter) {
                Text("All").tag(TypeFilter.all)
                Text("Films").tag(TypeFilter.film)
                Text("Series").tag(TypeFilter.series)
            }
            .pickerStyle(.segmented)
            .frame(width: 320)

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

    private var statsBar: some View {
        HStack(spacing: 24) {
            statItem(value: "\(libraryVM.filteredItems.filter { $0.type == .film }.count)", label: "FILMS")
            statItem(value: "\(libraryVM.filteredItems.filter { $0.type == .series }.count)", label: "SERIES")
            statItem(value: "\(libraryVM.filteredItems.count)", label: "TOTAL")
        }
        .padding(.horizontal, 40)
        .padding(.vertical, 8)
    }

    private func statItem(value: String, label: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
            Text(value)
                .font(ArchiveTheme.monoFont(size: 18).weight(.bold))
                .foregroundColor(ArchiveTheme.accent)
            Text(label)
                .font(ArchiveTheme.monoFont(size: 12))
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

    private var emptyState: some View {
        VStack(spacing: 16) {
            Spacer()
            Text("Nothing here yet")
                .font(ArchiveTheme.titleFont(size: 40))
                .foregroundColor(ArchiveTheme.border)
            Text("Head to Search to add your first title.")
                .font(ArchiveTheme.monoFont(size: 14))
                .foregroundColor(ArchiveTheme.textMuted)
                .kerning(3)
            Spacer()
        }
    }
}
