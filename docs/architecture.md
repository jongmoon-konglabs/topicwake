# Architecture

Topicwake runs the existing Rust service inside a Tauri process. Its WebView loads the UI from an app-owned loopback server.

```text
Tauri window → same-origin HTTP → Rust service
                                  ├─ authentication → SQLite
                                  ├─ network inspection → host OS
                                  └─ Zenoh subscriber → latest topic snapshots
```

## Responsibilities

| Location | Responsibility |
| --- | --- |
| `src/lib.rs` | HTTP routes, host/origin checks, server lifecycle |
| `src/observer.rs` | Zenoh session, subscription, bounded topic snapshots |
| `src/auth.rs` | Password hashes, local accounts, sessions |
| `src/network.rs` | Host addresses, Wi-Fi lookup, manual connectivity check |
| `src/main.rs` | Optional standalone web-server entry point |
| `src-tauri/src/main.rs` | Native window, single-instance handling, startup and shutdown |
| `src-tauri/src/database.rs` | Private app storage and first-launch database import |
| `frontend/` | Authentication, topic selection, and payload display |

The app depends on `src/`; it is not leftover browser-only code.

## Data model

The collector subscribes to `**` and keeps the latest sample per observed key. It stores at most 2,000 keys and an 8 KiB payload preview per key. Truncation is reported. Counts and receipt timestamps belong to the collector, not the publisher.

Topic count, connected Zenoh peer IDs, and physical device count are different quantities. The API exposes peer/router IDs but does not map them to topic publishers. Publisher IP and ID remain unknown; the UI does not infer them from peers or routes.

The UI polls roughly once per second after each request completes. Estimated rate is the change in received count divided by actual elapsed time. It is not a measured publisher frequency. Pausing freezes the visible snapshot while collection and polling continue. Message history is not persisted.

## App boundary

- Bind `127.0.0.1:0` before opening the WebView and retain ownership of the listener.
- Serve bundled frontend assets from the resource directory, not the working directory.
- Restrict HTTP Host/Origin and WebView navigation to the app's local origin. No broad native capabilities are granted to the page.
- A second launch focuses the existing window. Window close or app quit stops the app-owned server and collector.
- SQLite contains accounts and sessions. Passwords use Argon2; session cookies are HttpOnly and SameSite=Strict.

The app retains `com.konglabs.zenoh-observatory` as its identifier so existing account storage does not move. Imports use SQLite online backup from a read-only source, clear copied sessions, and never replace an existing app database. Startup fails rather than silently creating a new account store when an explicit import fails.

## Limits

Network visibility depends on Zenoh configuration and reachable publications. Being on the same SSID or subnet does not guarantee discovery. Zero topics does not prove macOS denied access.

The connectivity check tests DNS and a TCP connection to `example.com:443`, not overall internet health. The displayed host IP is not proof of the interface Zenoh uses. Wi-Fi lookup may return unknown because of OS privacy restrictions or interface assumptions.

This is a local, read-only tool. It does not provide multi-user roles, remote TLS deployment, a complete topic catalog, persistent message history, or device commands.
