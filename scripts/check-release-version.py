#!/usr/bin/env python3
"""Keep release tags, manifests, and locked local packages on one version."""

import json
import re
import sys
import tomllib
from pathlib import Path


def check_versions(root: Path, tag: str = "") -> str:
    versions = {}
    for folder in (Path(), Path("src-tauri")):
        manifest_path = root / folder / "Cargo.toml"
        manifest = tomllib.loads(manifest_path.read_text())["package"]
        versions[str(folder / "Cargo.toml")] = manifest["version"]
        lock = tomllib.loads((root / folder / "Cargo.lock").read_text())
        local = [item for item in lock["package"] if item["name"] == manifest["name"] and "source" not in item]
        if len(local) != 1:
            raise ValueError(f"{folder / 'Cargo.lock'} must contain exactly one local {manifest['name']} package")
        versions[str(folder / "Cargo.lock")] = local[0]["version"]
    versions["src-tauri/tauri.conf.json"] = json.loads((root / "src-tauri/tauri.conf.json").read_text())["version"]
    version = versions["Cargo.toml"]
    if not re.fullmatch(r"(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)", version):
        raise ValueError("releases require a stable X.Y.Z version")
    if any(value != version for value in versions.values()):
        raise ValueError(f"release versions differ: {versions}")
    if tag and tag != f"v{version}":
        raise ValueError(f"tag {tag!r} must be v{version}")
    return version


if __name__ == "__main__":
    try:
        print(check_versions(Path(__file__).resolve().parents[1], sys.argv[1] if len(sys.argv) == 2 else ""))
    except (KeyError, OSError, ValueError) as error:
        raise SystemExit(str(error)) from error
