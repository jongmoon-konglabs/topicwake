# Releasing

Topicwake builds for **Apple Silicon (`aarch64-apple-darwin`) only**. The [workflow](../.github/workflows/macos-release.yml) defines the process.

| Trigger | Result |
| --- | --- |
| Manual Actions run | Test and build; keep artifacts for seven days; no Release |
| Push a `vX.Y.Z` tag | Test and build; publish a Release with generated notes and assets |

## Before pushing a tag

1. Update both Cargo package versions and lockfiles, plus `src-tauri/tauri.conf.json`.
2. Run the [verification checks](acceptance.md) and a manual Actions build.
3. Review the intended commit and tag. A tag push publishes publicly; do not use test tags.

The version checker requires matching stable `X.Y.Z` versions and rejects prerelease tags. Existing Releases are not automatically overwritten.

## Outputs

The workflow uses the pinned Rust toolchain, Node 22.22.0, and locked dependencies on `macos-15`. It verifies the arm64 executable, Info.plist, signature integrity, DMG, and checksums.

Each build produces:

- `topicwake-<version>-aarch64-apple-darwin.app.zip`
- `topicwake-<version>-aarch64-apple-darwin.dmg`
- `topicwake-<version>-aarch64-apple-darwin.sha256`

Tag builds attach these files to the Release. GitHub generates change notes; review them for clarity. The build job has read-only repository access, and only the tag release job receives `contents: write`. External Actions are pinned to full commit SHAs. No environment approval gate is configured.

## Signing and user data

Builds use **ad-hoc signing only**. They are not Developer ID-signed or notarized, so Gatekeeper may block downloaded apps. Signature integrity and checksums do not replace notarization. See the [Tauri signing guide](https://v2.tauri.app/distribute/sign/macos/).

Do not package user databases, sessions, Zenoh configuration, or signing credentials. Keep the existing app identifier and database location when updating; see [accounts and configuration](../README.md#accounts-and-configuration). Never reset the database as an upgrade or rollback procedure.
