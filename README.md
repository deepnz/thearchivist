# The Archivist

A private catalogue for the films and television you care about, built for Apple TV.

Search the iTunes catalogue, add a title, and it takes its place in your collection
with a catalogue number of its own — `MV-0001` for films, `SV-0001` for series. Tag it
by genre, mark it watched, file it into as many watchlists as you like, and open it
straight in the Apple TV app when you want to watch it.

Your collection lives in your own private CloudKit database and syncs across every
Apple TV signed in to your account. There is no sign-up, no account to create, and no
server of mine in the middle.

## Features

- Search millions of films and TV series through the iTunes Search API
- Sequential catalogue numbers, archive-style
- Genre tagging, including custom genres
- Watchlists, with a title free to belong to several at once
- Watched markers visible at a glance in the grid
- Filter by type and genre, sort five ways
- Deep link into the Apple TV app for playback

## Requirements

- tvOS 17.0 or later
- Xcode 16 or later
- An iCloud account signed in on the device, for sync

## Building

```sh
open TheArchive/TheArchive.xcodeproj
```

Select the **TheArchive** scheme and run on an Apple TV simulator or device.

Running on a physical device needs your own signing team and a CloudKit container,
since the bundle identifier and container in the project are mine. Change
`PRODUCT_BUNDLE_IDENTIFIER` and the iCloud container in *Signing & Capabilities*, then
deploy the schema to production in the CloudKit dashboard before a release build.

### Tests

```sh
xcodebuild test -project TheArchive/TheArchive.xcodeproj \
  -scheme TheArchive -destination 'platform=tvOS Simulator,name=Apple TV'
```

21 tests cover the models, view models, the iTunes service, and the CloudKit layer.

## Architecture

MVVM, about 2,700 lines of Swift across 20 files. SwiftUI throughout, with no
third-party dependencies.

```
TheArchive/TheArchive/
├── Models/          LibraryItem, Watchlist, iTunesResult
├── ViewModels/      Library, Search, Watchlist
├── Services/        CloudKit, iTunes, event log
├── Views/           Library, Search, Watchlists
└── Theme/           Type scale, colour, shared components
```

**Storage.** CloudKit's private database, one `LibraryItem` record per title and one
`Watchlist` record per list. A `LibraryCounter` record hands out the sequential
catalogue numbers. Records keep their `CKRecord` so updates carry the server change
tag and don't clobber a newer write.

**Network.** Two endpoints, both Apple's: the iTunes Search API for lookups, and
`tv.apple.com` deep links for playback. The app collects nothing and talks to no other
service.

**Focus.** tvOS is driven by a remote, so focus order is deliberate throughout rather
than left to the default traversal — moving down from the tab bar lands on the type
filter, rows are entered at their leading item, and section jumps are explicit.

## Design

A mashup of basketball box score, JRPG menu, and Japanese editorial: Playfair Display
for titles, Courier Prime for data, gold on near-black. `TheArchive/DESIGN_SPEC.md`
has the full rationale.

## Note on the name

The app shipped as **The Archivist**; the App Store name *The Archive* was taken. The
bundle identifier, Xcode target, and directory names still read `TheArchive`, which is
cosmetic and deliberately left alone — changing the bundle identifier would break the
signed build and its CloudKit container.

## Licence

All rights reserved.
