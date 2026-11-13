#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$root"
case "${1:-run}" in
  build)
    available=$(df -Pk "$root" | awk 'NR == 2 { print $4 }')
    if [ "$available" -lt 6291456 ]; then
      echo "앱 빌드에 필요한 저장 공간이 부족합니다. 여유 공간을 6GiB 이상 확보해 주세요." >&2
      exit 1
    fi
    exec npx --yes @tauri-apps/cli@2.12.4 build --bundles app
    ;;
  run)
    app=""
    # Existing local bundles keep working until the first Topicwake build.
    for candidate in \
      "$root/src-tauri/target/release/bundle/macos/Topicwake.app" \
      "$root/src-tauri/target/debug/bundle/macos/Topicwake.app" \
      "$root/src-tauri/target/release/bundle/macos/Zenoh Observatory.app" \
      "$root/src-tauri/target/debug/bundle/macos/Zenoh Observatory.app"; do
      if [ -d "$candidate" ]; then app="$candidate"; break; fi
    done
    if [ -z "$app" ]; then echo "먼저 scripts/desktop.sh build를 실행하세요." >&2; exit 1; fi
    if [ -z "${ZENOH_ADMIN_IMPORT_DB:-}" ] && [ -f "$root/zenoh-admin.sqlite3" ]; then export ZENOH_ADMIN_IMPORT_DB="$root/zenoh-admin.sqlite3"; fi
    set -- /usr/bin/open
    if [ -n "${ZENOH_ADMIN_IMPORT_DB:-}" ]; then
      case "$ZENOH_ADMIN_IMPORT_DB" in /*) ;; *) ZENOH_ADMIN_IMPORT_DB="$root/$ZENOH_ADMIN_IMPORT_DB" ;; esac
      set -- "$@" --env "ZENOH_ADMIN_IMPORT_DB=$ZENOH_ADMIN_IMPORT_DB"
    fi
    if [ -n "${ZENOH_ADMIN_DATA_DIR:-}" ]; then set -- "$@" --env "ZENOH_ADMIN_DATA_DIR=$ZENOH_ADMIN_DATA_DIR"; fi
    if [ -n "${ZENOH_ADMIN_CONFIG:-}" ]; then
      case "$ZENOH_ADMIN_CONFIG" in /*) ;; *) ZENOH_ADMIN_CONFIG="$root/$ZENOH_ADMIN_CONFIG" ;; esac
      set -- "$@" --env "ZENOH_ADMIN_CONFIG=$ZENOH_ADMIN_CONFIG"
    fi
    exec "$@" "$app"
    ;;
  *) echo "사용법: scripts/desktop.sh [build|run]" >&2; exit 2 ;;
esac
