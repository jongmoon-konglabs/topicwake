# Verification

Run checks from the project root after installing frontend dependencies:

```sh
npm --prefix frontend test
npm --prefix frontend run build
cargo test --locked
cargo test --locked --manifest-path src-tauri/Cargo.toml
python3 scripts/test-release-version.py
```

Build the frontend before the desktop Rust tests on a fresh checkout; the Tauri build script needs its assets. The release workflow performs this ordering and validates the packaged app and DMG.

## App smoke check

- Create an account or import a synthetic test database; sign in and sign out.
- Search by topic name only; change sort order and select a row using mouse and keyboard.
- Read JSON, plain text, binary previews, deletion notices, and truncated payloads.
- Pause and resume. Confirm that collection continues and the next successful response restores the live view.
- Check missing-data, refresh-error, startup-error, and empty-search states.
- Resize around 900 px and 1100 px. Confirm details remain reachable, text fits, and focus returns to the list.
- Launch twice, then quit. Confirm only one app instance remains and its listener closes on exit.
- Check macOS Local Network behavior separately from a Terminal-launched service. Do not infer permission denial from an empty topic list.

## Safety and storage

Use isolated loopback Zenoh configuration and temporary databases for automated tests. Never connect tests to physical devices or publish to a hardware-connected network.

Check database import with live WAL data, invalid sources, and existing destinations. Preserve the original database and reject overwrite attempts. Do not delete account data as a recovery step.

A passing build is not evidence of network discovery, physical device behavior, accessibility conformance, or Apple notarization. Record those checks separately when performed.
