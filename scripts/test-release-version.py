import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location("release_version", Path(__file__).with_name("check-release-version.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class ReleaseVersionTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        for folder, name in ((Path(), "service"), (Path("src-tauri"), "desktop")):
            (self.root / folder).mkdir(exist_ok=True)
            (self.root / folder / "Cargo.toml").write_text(f'[package]\nname="{name}"\nversion="1.2.3"\n')
            (self.root / folder / "Cargo.lock").write_text(f'[[package]]\nname="{name}"\nversion="1.2.3"\n')
        (self.root / "src-tauri/tauri.conf.json").write_text(json.dumps({"version": "1.2.3"}))

    def test_matching_tag_and_manual_build(self):
        self.assertEqual(module.check_versions(self.root, "v1.2.3"), "1.2.3")
        self.assertEqual(module.check_versions(self.root), "1.2.3")

    def test_rejects_wrong_or_nonstable_tags(self):
        for tag in ("v1.2.4", "1.2.3", "v1.2.3-beta.1", "v1.2.3\n"):
            with self.subTest(tag=tag), self.assertRaises(ValueError):
                module.check_versions(self.root, tag)

    def test_rejects_different_manifest_or_lock_version(self):
        for path in ("Cargo.toml", "Cargo.lock", "src-tauri/Cargo.toml", "src-tauri/Cargo.lock", "src-tauri/tauri.conf.json"):
            with self.subTest(path=path):
                file = self.root / path
                original = file.read_text()
                file.write_text(original.replace("1.2.3", "1.2.4"))
                with self.assertRaises(ValueError):
                    module.check_versions(self.root)
                file.write_text(original)

    def test_rejects_missing_local_lock_entry(self):
        (self.root / "Cargo.lock").write_text('[[package]]\nname="other"\nversion="1.2.3"\n')
        with self.assertRaises(ValueError):
            module.check_versions(self.root)


if __name__ == "__main__":
    unittest.main()
