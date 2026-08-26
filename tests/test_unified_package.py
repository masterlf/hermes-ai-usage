from __future__ import annotations

import importlib.util
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import yaml

ROOT = Path(__file__).resolve().parent.parent
INSTALLER_SPEC = importlib.util.spec_from_file_location(
    "install_release_unified_contract", ROOT / "scripts/install_release.py"
)
assert INSTALLER_SPEC and INSTALLER_SPEC.loader
install_release = importlib.util.module_from_spec(INSTALLER_SPEC)
INSTALLER_SPEC.loader.exec_module(install_release)

PLUGIN_FILES = {
    "plugin.yaml",
    "__init__.py",
    "dashboard/manifest.json",
    "dashboard/plugin_api.py",
    "dashboard/dist/index.js",
    "dashboard/dist/style.css",
    "desktop/plugin.js",
}


class UnifiedPackageContractTests(unittest.TestCase):
    def test_repository_exposes_exact_runtime_package_shape(self):
        self.assertFalse((ROOT / "runtime/dashboard").exists())
        for relative in PLUGIN_FILES:
            self.assertTrue((ROOT / relative).is_file(), relative)

    def test_root_manifest_is_minimal_and_canonical(self):
        manifest = yaml.safe_load((ROOT / "plugin.yaml").read_text(encoding="utf-8"))
        self.assertEqual(manifest["name"], "ai-usage-monitor")
        self.assertEqual(manifest["version"], "0.7.4")
        self.assertEqual(manifest["manifest_version"], 1)
        self.assertEqual(manifest["api_version"], 1)
        self.assertEqual(manifest["author"], "BlueTeamForge")
        self.assertEqual(manifest["license"], "Apache-2.0")
        self.assertEqual(manifest["homepage"], "https://github.com/masterlf/hermes-ai-usage")
        self.assertEqual(
            set(manifest),
            {
                "name",
                "version",
                "manifest_version",
                "api_version",
                "description",
                "author",
                "license",
                "homepage",
                "tags",
            },
        )

    def test_root_register_is_inert(self):
        spec = importlib.util.spec_from_file_location("ai_usage_monitor_root", ROOT / "__init__.py")
        assert spec and spec.loader
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)

        class RejectingContext:
            def __getattr__(self, name):
                raise AssertionError(f"register accessed plugin context attribute {name}")

        self.assertIsNone(module.register(RejectingContext()))

    def test_current_release_identity_is_coherent(self):
        self.assertEqual(
            yaml.safe_load((ROOT / "plugin.yaml").read_text(encoding="utf-8"))["version"],
            "0.7.4",
        )
        self.assertEqual(
            json.loads((ROOT / "dashboard/manifest.json").read_text(encoding="utf-8"))[
                "version"
            ],
            "0.7.4",
        )
        expected = {
            "desktop/plugin.js": "const VERSION = 'v0.7.4'",
            "dashboard/dist/index.js": 'const VERSION = "v0.7.4"',
            "scripts/build_release.py": 'VERSION = "0.7.4"',
            "README.md": "Current plugin version: **v0.7.4**",
            "CHANGELOG.md": "## [0.7.4] - 2026-08-26",
            "docs/INSTALLATION.md": "VERSION=v0.7.4",
        }
        for relative, marker in expected.items():
            self.assertIn(marker, (ROOT / relative).read_text(encoding="utf-8"), relative)


class UnifiedLegacyMigrationContractTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.home = self.root / "hermes"
        self.home.mkdir(mode=0o700)
        (self.home / "config.yaml").write_bytes(b"plugins:\n  enabled: [other-plugin]\n")
        unrelated = self.home / "plugins/other-plugin"
        unrelated.mkdir(parents=True)
        (unrelated / "keep.txt").write_bytes(b"keep exactly")

    def tearDown(self):
        self.temporary.cleanup()

    @property
    def unified(self):
        return self.home / "plugins/ai-usage-monitor"

    @property
    def legacy_desktop(self):
        return self.home / "desktop-plugins/ai-usage-monitor"

    def _create_split_legacy(self):
        self.unified.mkdir(parents=True)
        (self.unified / "old-dashboard.txt").write_bytes(b"old dashboard")
        self.legacy_desktop.mkdir(parents=True)
        (self.legacy_desktop / "old-desktop.txt").write_bytes(b"old desktop")

    def _assert_old_split_state(self):
        self.assertEqual(
            {path.name for path in self.unified.iterdir()}, {"old-dashboard.txt"}
        )
        self.assertEqual(
            {path.name for path in self.legacy_desktop.iterdir()}, {"old-desktop.txt"}
        )

    def test_split_tree_migration_installs_one_tree_and_rolls_back_both(self):
        self._create_split_legacy()
        config_before = (self.home / "config.yaml").read_bytes()
        unrelated_before = (self.home / "plugins/other-plugin/keep.txt").read_bytes()

        backups = install_release.install(ROOT, self.home, "pre-074")

        installed = {
            path.relative_to(self.unified).as_posix()
            for path in self.unified.rglob("*")
            if path.is_file()
        }
        self.assertEqual(installed, PLUGIN_FILES)
        self.assertFalse(self.legacy_desktop.exists())
        self.assertNotEqual(backups["unified"], backups["legacy_desktop"])
        self.assertTrue((backups["unified"] / "old-dashboard.txt").is_file())
        self.assertTrue((backups["legacy_desktop"] / "old-desktop.txt").is_file())
        self.assertEqual((self.home / "config.yaml").read_bytes(), config_before)
        self.assertEqual(
            (self.home / "plugins/other-plugin/keep.txt").read_bytes(), unrelated_before
        )

        install_release.rollback(self.home, "pre-074")
        self._assert_old_split_state()

    def test_legacy_retirement_failure_restores_complete_split_state(self):
        self._create_split_legacy()
        real_replace = os.replace

        def fail_retirement(source, destination):
            if Path(source) == self.legacy_desktop:
                raise OSError("injected legacy retirement failure")
            real_replace(source, destination)

        with (
            mock.patch.object(install_release.os, "replace", side_effect=fail_retirement),
            self.assertRaisesRegex(OSError, "legacy retirement"),
        ):
            install_release.install(ROOT, self.home, "failed-retirement")

        self._assert_old_split_state()
        self.assertEqual(
            list((self.home / "plugins").glob(".ai-usage-monitor.stage-*")), []
        )

    def test_unified_stage_swap_failure_restores_complete_split_state(self):
        self._create_split_legacy()
        real_replace = os.replace

        def fail_unified_stage(source, destination):
            if ".stage-" in Path(source).name and Path(destination) == self.unified:
                raise OSError("injected unified stage swap failure")
            real_replace(source, destination)

        with (
            mock.patch.object(install_release.os, "replace", side_effect=fail_unified_stage),
            self.assertRaisesRegex(OSError, "unified stage swap"),
        ):
            install_release.install(ROOT, self.home, "failed-stage")

        self._assert_old_split_state()

    def test_rollback_failure_restores_installed_and_backup_state(self):
        self._create_split_legacy()
        backups = install_release.install(ROOT, self.home, "rollback-failure")
        real_replace = os.replace

        def fail_legacy_restore(source, destination):
            if Path(source) == backups["legacy_desktop"]:
                raise OSError("injected legacy restore failure")
            real_replace(source, destination)

        with (
            mock.patch.object(install_release.os, "replace", side_effect=fail_legacy_restore),
            self.assertRaisesRegex(OSError, "legacy restore"),
        ):
            install_release.rollback(self.home, "rollback-failure")

        self.assertTrue(self.unified.is_dir())
        self.assertFalse(self.legacy_desktop.exists())
        self.assertTrue((backups["unified"] / "old-dashboard.txt").is_file())
        self.assertTrue((backups["legacy_desktop"] / "old-desktop.txt").is_file())

    def test_rejects_relative_home_unsafe_backup_id_and_existing_backup_object(self):
        with self.assertRaisesRegex(ValueError, "explicit absolute"):
            install_release.install(ROOT, Path("relative-home"), "safe")
        with self.assertRaisesRegex(ValueError, "safe ASCII"):
            install_release.install(ROOT, self.home, "../escape")

        backup = self.home / "plugins/.ai-usage-monitor-unified.backup-collision"
        backup.parent.mkdir(parents=True, exist_ok=True)
        backup.write_bytes(b"unexpected object")
        with self.assertRaisesRegex(FileExistsError, "backup state"):
            install_release.install(ROOT, self.home, "collision")

    def test_rejects_symlinked_home_and_legacy_destination(self):
        home_link = self.root / "home-link"
        home_link.symlink_to(self.home, target_is_directory=True)
        with self.assertRaisesRegex(ValueError, "symlink"):
            install_release.install(ROOT, home_link, "home-link")

        outside = self.root / "outside"
        outside.mkdir()
        self.legacy_desktop.parent.mkdir(parents=True)
        self.legacy_desktop.symlink_to(outside, target_is_directory=True)
        with self.assertRaisesRegex(ValueError, "symlink"):
            install_release.install(ROOT, self.home, "legacy-link")


if __name__ == "__main__":
    unittest.main()
