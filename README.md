# Topicwake

A read-only Zenoh topic inspector for macOS. Find topics, check whether data is arriving, and inspect the latest payload.

**Apple Silicon only.** Intel and Universal builds are not provided.

[Releases](https://github.com/jongmoon-konglabs/topicwake/releases) · [Builds](https://github.com/jongmoon-konglabs/topicwake/actions/workflows/macos-release.yml)

## Download

Get the DMG or app ZIP from Releases. The app currently uses **ad-hoc signing, not Apple Developer ID signing or notarization**. Gatekeeper may block downloaded builds; follow your organization's security policy.

On a new installation, create a local account. Passwords require at least four characters, but use a stronger password for sensitive data.

## Build from source

Requires macOS, Xcode Command Line Tools, Rust via rustup, and Node.js/npm. The repository pins its Rust toolchain.

Run from the project root:

```sh
npm --prefix frontend ci
scripts/desktop.sh build
scripts/desktop.sh run
```

The release app is written to `src-tauri/target/release/bundle/macos/Topicwake.app`. The launcher also accepts a debug bundle and older locally built `Zenoh Observatory.app` bundles. It opens the app through macOS LaunchServices. Closing the window quits the app and its collector.

The build script checks for at least 6 GiB of free space. Actual build requirements can be higher.

### Accounts and configuration

The app stores accounts at:

```text
~/Library/Application Support/com.konglabs.zenoh-observatory/zenoh-admin.sqlite3
```

The existing identifier and database filename remain unchanged to preserve accounts.

For a first-time import, `scripts/desktop.sh run` uses `zenoh-admin.sqlite3` in the project root if present. It takes a consistent SQLite backup, including WAL data, without changing the original. Existing app accounts are never overwritten; imported sessions are cleared, so sign in again. A downloaded app does not automatically locate the project database.

| Variable | Purpose |
| --- | --- |
| `ZENOH_ADMIN_DATA_DIR` | Absolute path to a private app data directory |
| `ZENOH_ADMIN_IMPORT_DB` | Existing database to import on first launch |
| `ZENOH_ADMIN_CONFIG` | Zenoh JSON5 configuration file |

The app chooses its own loopback port. `ZENOH_ADMIN_DB` and `ZENOH_ADMIN_PORT` apply only to the optional web server.

## Use

- Search by **topic name** and sort by name, latest receipt, or received count.
- Select any row to inspect its latest payload. Pause freezes the display, not collection.
- Green means data arrived within five seconds. Red means no recent data, not a confirmed disconnection.
- Topics with no data for five minutes are hidden by default, not deleted.
- If no topics appear, check Zenoh configuration, routing, multicast, firewall rules, and macOS Local Network access. After allowing access, reopen the app if needed.

Topicwake lists keys it actually receives, not every possible topic on the same subnet. Publisher IP and ID are currently unavailable. Samples stay in bounded memory; SQLite stores accounts and sessions, not message history. The app cannot publish topics or send device commands.

## Project layout

- `src/` — shared Rust collector, authentication, network inspection, and HTTP server
- `src-tauri/` — Mac window, application lifecycle, and app database setup
- `frontend/` — React UI used by the app and optional local web server

The optional browser entry point remains available after building the frontend with `npm --prefix frontend run build`: run `cargo run --locked` and open <http://localhost:8080>. It uses a separate project-local database unless `ZENOH_ADMIN_DB` is set.

## Development and releases

[Architecture](docs/architecture.md) · [UI guidelines](docs/design-system.md) · [Scope](docs/prd.md) · [Verification](docs/acceptance.md) · [Releasing](docs/releasing.md)

A manual Actions run produces build artifacts only. Pushing a matching `vX.Y.Z` tag builds the Apple Silicon app and publishes a Release with generated notes, app ZIP, DMG, and checksums. See the release guide before pushing a tag.
