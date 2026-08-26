from __future__ import annotations

import importlib.util
import os
import stat
import tempfile
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parent.parent
SPEC = importlib.util.spec_from_file_location(
    "install_release", ROOT / "scripts/install_release.py"
)
assert SPEC and SPEC.loader
install_release = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(install_release)


class ReleaseInstallerTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.home = self.root / "hermes"
        self.home.mkdir(mode=0o700)
        (self.home / "config.yaml").write_text("plugins: []\n", encoding="utf-8")

    def tearDown(self):
        self.temporary.cleanup()

    def _destinations(self):
        return (
            self.home / "plugins/ai-usage-monitor",
            self.home / "desktop-plugins/ai-usage-monitor",
        )

    def test_upgrade_replaces_exact_trees_removes_stale_files_and_preserves_config(self):
        dashboard, desktop = self._destinations()
        (dashboard / "dashboard/dist").mkdir(parents=True)
        (dashboard / "stale.txt").write_text("stale", encoding="utf-8")
        desktop.mkdir(parents=True)
        (desktop / "stale.js").write_text("stale", encoding="utf-8")
        config_before = (self.home / "config.yaml").read_bytes()

        install_release.install(ROOT, self.home, "upgrade")

        self.assertEqual(
            {
                path.relative_to(dashboard).as_posix()
                for path in dashboard.rglob("*")
                if path.is_file()
            },
            {
                "plugin.yaml",
                "__init__.py",
                "dashboard/manifest.json",
                "dashboard/plugin_api.py",
                "dashboard/dist/index.js",
                "dashboard/dist/style.css",
                "desktop/plugin.js",
            },
        )
        self.assertFalse(desktop.exists())
        self.assertEqual((self.home / "config.yaml").read_bytes(), config_before)
        for path in dashboard.rglob("*"):
            expected = 0o755 if path.is_dir() else 0o644
            self.assertEqual(stat.S_IMODE(path.stat().st_mode), expected)

    def test_existing_components_use_distinct_backup_tree_names_and_rollback(self):
        dashboard, desktop = self._destinations()
        dashboard.mkdir(parents=True)
        desktop.mkdir(parents=True)
        (dashboard / "old-dashboard").write_text("old", encoding="utf-8")
        (desktop / "old-desktop").write_text("old", encoding="utf-8")

        backups = install_release.install(ROOT, self.home, "before-073")

        self.assertNotEqual(backups["unified"].name, backups["legacy_desktop"].name)
        self.assertTrue((backups["unified"] / "old-dashboard").is_file())
        self.assertTrue((backups["legacy_desktop"] / "old-desktop").is_file())
        install_release.rollback(self.home, "before-073")
        self.assertEqual({path.name for path in dashboard.iterdir()}, {"old-dashboard"})
        self.assertEqual({path.name for path in desktop.iterdir()}, {"old-desktop"})

    def test_fresh_install_rollback_restores_absent_component_state(self):
        dashboard, desktop = self._destinations()
        install_release.install(ROOT, self.home, "fresh")
        self.assertTrue(dashboard.is_dir())
        self.assertFalse(desktop.exists())

        install_release.rollback(self.home, "fresh")

        self.assertFalse(dashboard.exists())
        self.assertFalse(desktop.exists())

    def test_rejects_symlinked_destination_or_ancestor(self):
        outside = self.root / "outside"
        outside.mkdir()
        (self.home / "plugins").symlink_to(outside, target_is_directory=True)
        with self.assertRaisesRegex(ValueError, "symlink"):
            install_release.install(ROOT, self.home, "unsafe")

    def test_rejects_existing_regular_file_destination(self):
        destination = self.home / "desktop-plugins/ai-usage-monitor"
        destination.parent.mkdir(parents=True)
        destination.write_text("not a plugin tree", encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "non-symlink directory"):
            install_release.install(ROOT, self.home, "unsafe-file")
        self.assertEqual(destination.read_text(encoding="utf-8"), "not a plugin tree")
        self.assertEqual(list((self.home / "plugins").glob(".ai-usage-monitor.stage-*")), [])

    def test_legacy_retirement_failure_rolls_back_both_components(self):
        dashboard, desktop = self._destinations()
        dashboard.mkdir(parents=True)
        desktop.mkdir(parents=True)
        (dashboard / "old-dashboard").write_text("old", encoding="utf-8")
        (desktop / "old-desktop").write_text("old", encoding="utf-8")
        real_replace = os.replace

        def fail_legacy_retirement(source, destination):
            source_path = Path(source)
            if source_path == desktop:
                raise OSError("injected legacy retirement failure")
            real_replace(source, destination)

        with (
            mock.patch.object(install_release.os, "replace", side_effect=fail_legacy_retirement),
            self.assertRaisesRegex(OSError, "legacy retirement"),
        ):
            install_release.install(ROOT, self.home, "failed")

        self.assertEqual({path.name for path in dashboard.iterdir()}, {"old-dashboard"})
        self.assertEqual({path.name for path in desktop.iterdir()}, {"old-desktop"})


if __name__ == "__main__":
    unittest.main()
