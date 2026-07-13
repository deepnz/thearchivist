# The Archive — Build Progress

Last updated: 2026-07-13

---

## Overall Status

| Phase | Status |
|---|---|
| Project setup | ✅ Done |
| Core code (Tasks 2–14) | ✅ Done |
| Launch-readiness hardening (see below) | ✅ Code complete — needs Xcode build/test run |
| CloudKit schema | ⏳ Manual step |
| Device testing | ⏳ Manual step |
| App Store prep | ⏳ Screenshots + submission remain |

---

## Launch-readiness hardening (2026-07-13)

A full code review pass for App Store launch. All changes are code-complete;
**they were authored in an environment without Xcode/tvOS SDK, so the
build + unit-test run below is the first required step on a Mac.**

### On-device storage (new)
- `Services/LocalStore.swift` — JSON snapshot of the entire library in the
  Caches directory (the only persistent-ish writable location on tvOS;
  purge-safe because CloudKit holds the durable copy).
- `Services/DataStore.swift` — local-first repository. All view mutations go
  through it: view models update instantly, snapshot persists to disk, a
  pending-op queue syncs to CloudKit in the background and retries on
  reconnect / foreground / next launch. Launch is cache-first (instant
  library, no spinner unless truly empty), then reconciles with CloudKit
  ("server wins except locally-pending records" — `DataStore.merge`).
- Sign-out (or credential revocation) wipes local data and queued writes.

### App Review blockers removed
- Deleted the forced `auth.isSignedIn = true` simulator bypass and the
  hardcoded mock library from `TheArchiveApp.swift` (2.1 placeholder-content
  rejection; also made sign-in unusable).
- Created real tvOS brand assets: `App Icon & Top Shelf Image.brandassets`
  (layered App Store 1280×768 + 400×240/800×480 icons, Top Shelf
  1920×720/3840×1440 and Wide 2320×720/4640×1440) and
  `LaunchImage.launchimage` (1920×1080, 3840×2160), generated from the
  bundled Playfair/Courier fonts and app palette. Build settings updated
  (`ASSETCATALOG_COMPILER_APPICON_NAME`, `ASSETCATALOG_COMPILER_LAUNCHIMAGE_NAME`).
  The empty iOS-style `AppIcon.appiconset` was removed.
- `Info.plist`: added `UIUserInterfaceStyle = Dark` to match the app's forced
  dark scheme.

### Deep links now point at the exact title
- `iTunesResult` captures `trackViewUrl` / `collectionViewUrl`; new
  `LibraryItem.storeURL` field persists it (additive CloudKit schema change).
- `Services/AppleTVLink.swift` builds the open URL: canonical store URL with
  scheme swapped to `videos://` (host-validated) → constructed
  `videos://itunes.apple.com/{country}/movie|tv-season/id{id}` for legacy
  records → TV-app search by title as last resort. The detail sheet tries
  each in order before showing an error alert.
- iTunes searches now pass `country=` (user's storefront) so IDs and URLs
  resolve in the user's own store.

### Sync & auth robustness
- `saveItem`/`saveWatchlist` recover from `serverRecordChanged` by re-applying
  fields to the server record (previously: silent data loss after any cache
  reload or cross-device edit).
- Deletes tolerate `unknownItem` (offline add-then-remove can't zombie).
- `nextCatalogID` retries only on genuine CAS conflicts and fails fast to
  `MV-????` offline (previously ~3.5 s of pointless retries).
- Credential check on foreground signs out only on `.revoked`/`.notFound`;
  transient errors (no network) no longer log the user out.
- Unused `itemExists` CloudKit query removed — the duplicate check is local,
  so the `iTunesID` queryable index is no longer required.

### Performance
- `URLCache.shared` enlarged (32 MB memory / 256 MB disk) for poster artwork.
- `LibraryView` computes the filtered/sorted list once per render (was 5×).
- Poster grids use tvOS `.card` button style for the native focus treatment.

### Tests (all network-free)
- `ModelTests` — CKRecord round-trips incl. `storeURL` + legacy records,
  changeTag record reuse, Codable round-trips.
- `iTunesServiceTests` — URL building incl. `country=`, film + tvSeason
  fixtures incl. store URLs.
- `AppleTVLinkTests` (new) — scheme swap, host validation, legacy fallback,
  search fallback encoding.
- `LocalStoreTests` (new) — snapshot round-trip, overwrite, clear, corrupt file.
- `DataStoreTests` (new) — merge policy (server wins / pending wins / offline
  add / offline delete).
- `CloudKitServiceTests`, `LibraryViewModelTests`, `SearchViewModelTests` — unchanged.

---

## Task Checklist (original build)

Tasks 1–14 (project setup through app entry point): ✅ done — see git history.

### ⏳ Task 15 — Verify hardening pass in Xcode *(manual — requires Mac)*
- [ ] `Cmd+B` — build the app target
- [ ] `Cmd+U` — run TheArchiveTests (all suites are network-free)
- [ ] Verify asset catalog compiles (brand assets + launch image)

### ⏳ Task 16 — CloudKit Schema *(manual — requires Xcode + iCloud account)*
- [ ] Run app on device/simulator signed into iCloud → first write auto-creates
      record types in the dev environment: `LibraryItem` (now incl. `storeURL`),
      `Watchlist`, `LibraryCounter`
- [ ] In [CloudKit Dashboard](https://icloud.developer.apple.com/dashboard):
      confirm record types; promote schema to production before submission
- [ ] (The previously-listed `iTunesID` queryable index is no longer needed)

### ⏳ Task 17 — End-to-End Device Testing *(manual — requires Apple TV)*
- [ ] Sign in with Apple
- [ ] Search + add a title; kill network mid-session and verify offline
      add/edit/delete + banner, then reconnect and verify CloudKit sync
- [ ] Detail sheet: genre chip, watched toggle
- [ ] **Open in Apple TV: verify the direct `videos://` store-URL link lands on
      the exact title (film AND series); yank `storeURL` on a test record to
      exercise the constructed-URL and search fallbacks**
- [ ] Watchlists: create, rename, delete, add/remove titles
- [ ] Relaunch offline: verify instant cache-first load
- [ ] Sign out: verify local data cleared
- [ ] Remove from library (verify watchlist pruning)

### ⏳ Task 18 — App Store Submission *(manual)*
- [ ] Version 1.0, Build 1 — archive + validate (asset validation now has real
      brand assets to check)
- [ ] Screenshots (1920×1080)
- [ ] Submit via App Store Connect

---

## Build Status

```
Last verified Xcode build: 2026-03-23 (BUILD SUCCEEDED), prior to the
2026-07-13 hardening pass. The hardening pass was authored without access
to Xcode — run Cmd+B / Cmd+U first.
```

**Known issue:** `xcodebuild test` via scheme fails because Xcode reports
"tvOS 26.2 not installed" even though the SDK and simulator (tvOS 26.1) are
present — a version string mismatch. **Tests run fine from Xcode (Cmd+U).**

## Running in the simulator

1. Open `TheArchive/TheArchive.xcodeproj`, select an Apple TV simulator, Cmd+R.
2. Sign in with Apple does not work in the simulator. For UI-only testing you
   can temporarily set `auth.isSignedIn = true` in `TheArchiveApp` —
   **do not commit that change.** CloudKit still requires an iCloud account;
   without one the app now runs from the local snapshot (empty on first
   launch) instead of mock data.
