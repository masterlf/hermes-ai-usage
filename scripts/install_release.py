#!/usr/bin/env python3
"""Install or roll back the exact AI Usage release trees without touching config."""
from __future__ import annotations

import argparse
import os
import re
import shutil
import stat
import tempfile
from pathlib import Path

_COMPONENTS = {
    "dashboard": {
        "destination": Path("plugins/ai-usage-monitor"),
        "backup": ".ai-usage-monitor-dashboard.backup-{backup_id}",
        "files": {
            Path("runtime/dashboard/manifest.json"): Path("dashboard/manifest.json"),
            Path("runtime/dashboard/plugin_api.py"): Path("dashboard/plugin_api.py"),
            Path("runtime/dashboard/dist/index.js"): Path("dashboard/dist/index.js"),
            Path("runtime/dashboard/dist/style.css"): Path("dashboard/dist/style.css"),
        },
    },
    "desktop": {
        "destination": Path("desktop-plugins/ai-usage-monitor"),
        "backup": ".ai-usage-monitor-desktop.backup-{backup_id}",
        "files": {Path("desktop/plugin.js"): Path("plugin.js")},
    },
}
_BACKUP_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$")


def _canonical_home(home: Path) -> Path:
    if not home.is_absolute():
        raise ValueError("HERMES_HOME must be an explicit absolute canonical path")
    canonical = home.resolve(strict=True)
    if canonical != home:
        raise ValueError("HERMES_HOME or one of its ancestors is a symlink or is not canonical")
    if not canonical.is_dir():
        raise ValueError("HERMES_HOME must be an existing directory")
    return canonical


def _validate_backup_id(backup_id: str) -> None:
    if not _BACKUP_ID_RE.fullmatch(backup_id):
        raise ValueError("backup id must contain only safe ASCII filename characters")


def _reject_symlink_components(home: Path, destination: Path) -> None:
    destination.relative_to(home)
    current = home
    for part in destination.relative_to(home).parts:
        current = current / part
        try:
            mode = current.lstat().st_mode
        except FileNotFoundError:
            continue
        if stat.S_ISLNK(mode):
            raise ValueError("symlinked destination or ancestor is not permitted")
        if current != destination and not stat.S_ISDIR(mode):
            raise ValueError("destination ancestor is not a directory")


def _remove_tree(path: Path) -> None:
    if path.exists():
        shutil.rmtree(path)


def _stage_component(release_root: Path, parent: Path, files: dict[Path, Path]) -> Path:
    stage = Path(tempfile.mkdtemp(prefix=".ai-usage-monitor.stage-", dir=parent))
    os.chmod(stage, 0o755)  # noqa: S103 - release tree directories have an exact public mode
    try:
        for source_relative, target_relative in files.items():
            source = release_root / source_relative
            if source.is_symlink() or not source.is_file():
                raise ValueError("release tree contains a missing or symlinked required file")
            target = stage / target_relative
            target.parent.mkdir(parents=True, exist_ok=True)
            os.chmod(target.parent, 0o755)  # noqa: S103 - exact release directory mode
            shutil.copyfile(source, target)
            os.chmod(target, 0o644)
        return stage
    except BaseException:
        _remove_tree(stage)
        raise


def _paths(home: Path, name: str, backup_id: str) -> tuple[Path, Path]:
    component = _COMPONENTS[name]
    destination = home / component["destination"]
    backup = destination.parent / component["backup"].format(backup_id=backup_id)
    return destination, backup


def _absent_marker(destination: Path, name: str, backup_id: str) -> Path:
    return destination.parent / f".ai-usage-monitor-{name}.absent-{backup_id}"


def install(release_root: Path, hermes_home: Path, backup_id: str) -> dict[str, Path]:
    """Install both exact trees, rolling everything back if either atomic swap fails."""
    home = _canonical_home(hermes_home)
    _validate_backup_id(backup_id)
    release_root = release_root.resolve(strict=True)
    stages: dict[str, Path] = {}
    backups: dict[str, Path] = {}
    swapped: list[str] = []

    try:
        for name in _COMPONENTS:
            destination, backup = _paths(home, name, backup_id)
            absent = _absent_marker(destination, name, backup_id)
            _reject_symlink_components(home, destination)
            if backup.exists() or backup.is_symlink() or absent.exists() or absent.is_symlink():
                raise FileExistsError("selected component backup state already exists")
            if destination.exists() and not destination.is_dir():
                raise ValueError("existing component destination must be a directory")
            destination.parent.mkdir(mode=0o755, parents=True, exist_ok=True)
            _reject_symlink_components(home, destination)
            stages[name] = _stage_component(
                release_root, destination.parent, _COMPONENTS[name]["files"]
            )
            backups[name] = backup
    except BaseException:
        for stage in stages.values():
            _remove_tree(stage)
        raise

    try:
        for name in _COMPONENTS:
            destination, backup = _paths(home, name, backup_id)
            absent = _absent_marker(destination, name, backup_id)
            if destination.exists():
                os.replace(destination, backup)
            else:
                absent.touch(mode=0o600, exist_ok=False)
            try:
                os.replace(stages[name], destination)
            except BaseException:
                if backup.exists() and not destination.exists():
                    os.replace(backup, destination)
                absent.unlink(missing_ok=True)
                raise
            swapped.append(name)
    except BaseException:
        for name in reversed(swapped):
            destination, backup = _paths(home, name, backup_id)
            _remove_tree(destination)
            if backup.exists():
                os.replace(backup, destination)
            _absent_marker(destination, name, backup_id).unlink(missing_ok=True)
        raise
    finally:
        for stage in stages.values():
            _remove_tree(stage)

    return backups


def rollback(hermes_home: Path, backup_id: str, components: tuple[str, ...]) -> None:
    """Restore selected component backups, transactionally when more than one is selected."""
    home = _canonical_home(hermes_home)
    _validate_backup_id(backup_id)
    displaced: dict[str, Path] = {}
    restored: list[str] = []
    had_backup: dict[str, bool] = {}
    for name in components:
        if name not in _COMPONENTS:
            raise ValueError("unknown component")
        destination, backup = _paths(home, name, backup_id)
        absent = _absent_marker(destination, name, backup_id)
        _reject_symlink_components(home, destination)
        backup_valid = backup.is_dir() and not backup.is_symlink()
        absent_valid = absent.is_file() and not absent.is_symlink()
        if backup_valid == absent_valid:
            raise FileNotFoundError("selected component backup does not exist")
        had_backup[name] = backup_valid

    try:
        for name in components:
            destination, backup = _paths(home, name, backup_id)
            temporary = Path(
                tempfile.mkdtemp(prefix=".ai-usage-monitor.rollback-", dir=destination.parent)
            )
            temporary.rmdir()
            if destination.exists():
                os.replace(destination, temporary)
                displaced[name] = temporary
            if had_backup[name]:
                try:
                    os.replace(backup, destination)
                except BaseException:
                    if name in displaced and not destination.exists():
                        os.replace(displaced.pop(name), destination)
                    raise
            restored.append(name)
    except BaseException:
        for name in reversed(restored):
            destination, backup = _paths(home, name, backup_id)
            if had_backup[name]:
                os.replace(destination, backup)
            if name in displaced:
                os.replace(displaced[name], destination)
        raise
    else:
        for name in restored:
            destination, _backup = _paths(home, name, backup_id)
            _absent_marker(destination, name, backup_id).unlink(missing_ok=True)
        for path in displaced.values():
            _remove_tree(path)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--hermes-home", required=True, type=Path)
    parser.add_argument("--backup-id", required=True)
    parser.add_argument("--rollback", action="store_true")
    parser.add_argument(
        "--component",
        choices=("all", "dashboard", "desktop"),
        default="all",
        help="rollback all trees or one distinct component",
    )
    args = parser.parse_args()
    if args.rollback:
        selected = tuple(_COMPONENTS) if args.component == "all" else (args.component,)
        rollback(args.hermes_home, args.backup_id, selected)
        print(f"Rolled back {args.component} under {args.hermes_home}")
    else:
        if args.component != "all":
            parser.error("--component is only valid with --rollback")
        install(Path(__file__).resolve().parent.parent, args.hermes_home, args.backup_id)
        print(
            f"Installed dashboard and desktop under {args.hermes_home}; "
            f"backup id: {args.backup_id}"
        )


if __name__ == "__main__":
    main()
