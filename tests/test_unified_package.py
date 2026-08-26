from __future__ import annotations

import importlib.util
import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import yaml

ROOT = Path(__file__).resolve().parent.parent
HOST_CONTRACT = "unified-desktop-plugin-root-v1"
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
    @staticmethod
    def _primary_preflight(relative: str) -> str:
        source = (ROOT / relative).read_text(encoding="utf-8")
        heading = "## Primary install path" if relative.startswith("docs/") else "## Installation"
        start = source.index("```bash", source.index(heading)) + len("```bash")
        end = source.index("```", start)
        block = source[start:end].strip()
        block = block[block.index('export HERMES_HOME="'):]
        return block.split('V074_SHA="', 1)[0]

    def _run_primary_preflight(self, relative: str, home: Path) -> subprocess.CompletedProcess[str]:
        script = self._primary_preflight(relative).replace(
            'export HERMES_HOME="/exact/Path/from-profile-show"',
            f'export HERMES_HOME="{home}"',
        )
        return subprocess.run(  # noqa: S603 - executes the checked-in operator preflight
            ["/bin/bash", "-c", f"set -eu\n{script}\nprintf 'WOULD_INSTALL\\n'"],
            text=True,
            capture_output=True,
            check=False,
        )

    def test_repository_exposes_exact_runtime_package_shape(self):
        obsolete_path = Path("runtime") / "dashboard"
        self.assertFalse((ROOT / obsolete_path).exists())
        for relative in PLUGIN_FILES:
            self.assertTrue((ROOT / relative).is_file(), relative)

    def test_codeowners_routes_the_canonical_dashboard_api(self):
        codeowners = (ROOT / ".github/CODEOWNERS").read_text(encoding="utf-8")
        self.assertIn("/dashboard/plugin_api.py @masterlf", codeowners.splitlines())
        obsolete_codeowner = "/" + (Path("runtime") / "dashboard/plugin_api.py").as_posix()
        self.assertNotIn(obsolete_codeowner, codeowners)

    def test_stale_production_path_invariant_scans_tests_without_self_triggering(self):
        spec = importlib.util.spec_from_file_location(
            "security_invariants_stale_path", ROOT / "scripts/security_invariants.py"
        )
        assert spec and spec.loader
        security_invariants = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(security_invariants)
        with tempfile.TemporaryDirectory() as temporary:
            scan_root = Path(temporary)
            (scan_root / "tests").mkdir()
            (scan_root / "tests/test_contract.py").write_text(
                'needle = "runtime" + "/dashboard"\n', encoding="utf-8"
            )
            (scan_root / "docs").mkdir()
            stale = "runtime" + "/dashboard"
            (scan_root / "docs/INSTALLATION.md").write_text(stale, encoding="utf-8")

            self.assertEqual(
                security_invariants.find_stale_production_path(scan_root),
                Path("docs/INSTALLATION.md"),
            )

    def test_release_docs_preserve_the_operator_action_boundary(self):
        boundary = (
            "Merging or publishing v0.7.4 distributes artifacts only; neither action deploys, "
            "restarts, upgrades, or changes any Hermes installation. Installation or migration "
            "remains a separate, explicit operator action."
        )
        for relative in ("README.md", "docs/INSTALLATION.md"):
            source = (ROOT / relative).read_text(encoding="utf-8")
            self.assertIn(boundary, " ".join(source.split()), relative)

    def test_release_docs_require_explicit_live_desktop_activation(self):
        required = (
            "Settings → Plugins",
            "Desktop plugins",
            "AI Usage Monitor",
            "Rescan",
            "No Desktop reload or restart is required",
            "old standalone copy's enablement state is not authority for the new unified root",
        )
        for relative in ("README.md", "docs/INSTALLATION.md"):
            source = (ROOT / relative).read_text(encoding="utf-8")
            prose = " ".join(source.split())
            for marker in required:
                self.assertIn(marker, prose, f"{relative}: {marker}")

        installation = " ".join(
            (ROOT / "docs/INSTALLATION.md").read_text(encoding="utf-8").split()
        )
        inventory = installation.index("confirm its switch is off")
        activate = installation.index("switch it on")
        verify = installation.index("status-bar indicator")
        self.assertLess(inventory, activate)
        self.assertLess(activate, verify)

    def test_primary_git_install_fails_closed_on_legacy_or_manual_trees(self):
        required = (
            'test "$HERMES_HOME" = "$(realpath -e -- "$HERMES_HOME")"',
            'LEGACY_DESKTOP="$HERMES_HOME/desktop-plugins/ai-usage-monitor"',
            'UNIFIED="$HERMES_HOME/plugins/ai-usage-monitor"',
            'if [ -e "$LEGACY_DESKTOP" ] || [ -L "$LEGACY_DESKTOP" ]; then',
            'git -C "$UNIFIED" rev-parse --show-toplevel',
            "Legacy split-tree migration or deterministic manual fallback",
        )
        for relative in ("README.md", "docs/INSTALLATION.md"):
            source = (ROOT / relative).read_text(encoding="utf-8")
            for marker in required:
                self.assertIn(marker, source, f"{relative}: {marker}")

    def test_primary_git_preflight_rejects_symlinked_plugin_roots_without_mutation(self):
        for relative in ("README.md", "docs/INSTALLATION.md"):
            for root_name in ("plugins", "desktop-plugins"):
                with (
                    self.subTest(relative=relative, root=root_name),
                    tempfile.TemporaryDirectory() as temporary,
                ):
                    scratch = Path(temporary)
                    home = scratch / "home"
                    outside = scratch / "outside"
                    home.mkdir()
                    outside.mkdir()
                    config = home / "config.yaml"
                    unrelated = home / "unrelated-plugin.sentinel"
                    target_sentinel = outside / "target.sentinel"
                    config.write_text("plugins: {}\n", encoding="utf-8")
                    unrelated.write_text("unrelated\n", encoding="utf-8")
                    target_sentinel.write_text("outside\n", encoding="utf-8")
                    (home / root_name).symlink_to(outside, target_is_directory=True)
                    before = (
                        config.read_bytes(),
                        unrelated.read_bytes(),
                        target_sentinel.read_bytes(),
                    )

                    result = self._run_primary_preflight(relative, home)

                    self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
                    self.assertNotIn("WOULD_INSTALL", result.stdout)
                    self.assertTrue((home / root_name).is_symlink())
                    self.assertEqual(
                        (config.read_bytes(), unrelated.read_bytes(), target_sentinel.read_bytes()),
                        before,
                    )

    def test_primary_git_preflight_allows_absent_regular_plugin_roots(self):
        for relative in ("README.md", "docs/INSTALLATION.md"):
            with self.subTest(relative=relative), tempfile.TemporaryDirectory() as temporary:
                home = Path(temporary) / "home"
                home.mkdir()
                (home / "config.yaml").write_text("plugins: {}\n", encoding="utf-8")

                result = self._run_primary_preflight(relative, home)

                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                self.assertIn("WOULD_INSTALL", result.stdout)
                self.assertFalse((home / "plugins").exists())
                self.assertFalse((home / "desktop-plugins").exists())

    def test_release_docs_describe_truthful_pinned_git_transition(self):
        required = (
            "pinned exact-SHA install is intentionally immutable",
            "`hermes plugins update ai-usage-monitor` is expected to fail closed",
            "new exact 40-character commit SHA",
            "scanner enabled",
            "bounded interactive review of every `CAUTION` finding",
            "stop on `BLOCK`",
            "Never use `--force` or disable the scanner",
            "transactional release installer, not this Git lifecycle",
            "preserve the old exact SHA and recovery prerequisites before removal",
            "unrelated plugins or configuration",
        )
        obsolete_lifecycle = (
            "\nhermes plugins disable ai-usage-monitor\n"
            "hermes plugins update ai-usage-monitor\n"
        )
        for relative in ("README.md", "docs/INSTALLATION.md"):
            source = (ROOT / relative).read_text(encoding="utf-8")
            prose = " ".join(source.split())
            for marker in required:
                self.assertIn(marker, prose, f"{relative}: {marker}")
            self.assertNotIn(obsolete_lifecycle, source, relative)

    def test_tested_baseline_uses_local_source_as_authority(self):
        authority = "local source authority `981101239a064c020a9d18fc3b1060ae306934ed`"
        for relative in ("README.md", "docs/INSTALLATION.md"):
            source = (ROOT / relative).read_text(encoding="utf-8")
            prose = " ".join(source.split())
            self.assertIn("Tested baseline (not a minimum-support claim)", prose, relative)
            self.assertIn(authority, prose, relative)
            self.assertNotIn("1bbb6e5b", source, relative)

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

    def _install(self, backup_id):
        return install_release.install(ROOT, self.home, backup_id, HOST_CONTRACT)

    def test_split_tree_migration_installs_one_tree_and_rolls_back_both(self):
        self._create_split_legacy()
        config_before = (self.home / "config.yaml").read_bytes()
        unrelated_before = (self.home / "plugins/other-plugin/keep.txt").read_bytes()

        backups = self._install("pre-074")

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
            self._install("failed-retirement")

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
            self._install("failed-stage")

        self._assert_old_split_state()

    def test_rollback_failure_restores_installed_and_backup_state(self):
        self._create_split_legacy()
        backups = self._install("rollback-failure")
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
            install_release.install(ROOT, Path("relative-home"), "safe", HOST_CONTRACT)
        with self.assertRaisesRegex(ValueError, "safe ASCII"):
            self._install("../escape")

        backup = self.home / "plugins/.ai-usage-monitor-unified.backup-collision"
        backup.parent.mkdir(parents=True, exist_ok=True)
        backup.write_bytes(b"unexpected object")
        with self.assertRaisesRegex(FileExistsError, "backup state"):
            self._install("collision")

    def test_rejects_symlinked_home_and_legacy_destination(self):
        home_link = self.root / "home-link"
        home_link.symlink_to(self.home, target_is_directory=True)
        with self.assertRaisesRegex(ValueError, "symlink"):
            install_release.install(ROOT, home_link, "home-link", HOST_CONTRACT)

        outside = self.root / "outside"
        outside.mkdir()
        self.legacy_desktop.parent.mkdir(parents=True)
        self.legacy_desktop.symlink_to(outside, target_is_directory=True)
        with self.assertRaisesRegex(ValueError, "symlink"):
            self._install("legacy-link")

    def test_rejects_unverified_host_contract_before_changing_split_tree(self):
        self._create_split_legacy()

        with self.assertRaisesRegex(ValueError, "host contract"):
            install_release.install(ROOT, self.home, "unsupported-host", "legacy-desktop-only")

        self._assert_old_split_state()
        self.assertEqual(list((self.home / "plugins").glob("*.backup-*")), [])


if __name__ == "__main__":
    unittest.main()
