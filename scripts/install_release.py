#!/usr/bin/env python3
"""Install or roll back the unified AI Usage package without touching config."""
from __future__ import annotations

import argparse
import os
import re
import shutil
import stat
import tempfile
from pathlib import Path

_UNIFIED_RELATIVE = Path("plugins/ai-usage-monitor")
_LEGACY_DESKTOP_RELATIVE = Path("desktop-plugins/ai-usage-monitor")
_PACKAGE_FILES = (
    Path("plugin.yaml"),
    Path("__init__.py"),
    Path("dashboard/manifest.json"),
    Path("dashboard/plugin_api.py"),
    Path("dashboard/dist/index.js"),
    Path("dashboard/dist/style.css"),
    Path("desktop/plugin.js"),
)
_BACKUP_NAMES = {
    "unified": ".ai-usage-monitor-unified.backup-{backup_id}",
    "legacy_desktop": ".ai-usage-monitor-legacy-desktop.backup-{backup_id}",
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


def _canonical_release_root(release_root: Path) -> Path:
    if not release_root.is_absolute():
        release_root = release_root.absolute()
    canonical = release_root.resolve(strict=True)
    if canonical != release_root or not canonical.is_dir():
        raise ValueError("release root must be a canonical, symlink-free directory")
    return canonical


def _validate_backup_id(backup_id: str) -> None:
    if not _BACKUP_ID_RE.fullmatch(backup_id):
        raise ValueError("backup id must contain only safe ASCII filename characters")


def _reject_symlink_components(root: Path, path: Path) -> None:
    try:
        relative = path.relative_to(root)
    except ValueError as exc:
        raise ValueError("path escapes its canonical root") from exc
    current = root
    for part in relative.parts:
        current = current / part
        try:
            mode = current.lstat().st_mode
        except FileNotFoundError:
            continue
        if stat.S_ISLNK(mode):
            raise ValueError("symlinked destination, source, or ancestor is not permitted")
        if current != path and not stat.S_ISDIR(mode):
            raise ValueError("path ancestor is not a directory")


def _exists(path: Path) -> bool:
    return path.exists() or path.is_symlink()


def _remove_tree(path: Path) -> None:
    if path.exists():
        shutil.rmtree(path)


def _state_paths(home: Path, backup_id: str) -> dict[str, tuple[Path, Path, Path]]:
    destinations = {
        "unified": home / _UNIFIED_RELATIVE,
        "legacy_desktop": home / _LEGACY_DESKTOP_RELATIVE,
    }
    return {
        name: (
            destination,
            destination.parent / _BACKUP_NAMES[name].format(backup_id=backup_id),
            destination.parent / f".ai-usage-monitor-{name}.absent-{backup_id}",
        )
        for name, destination in destinations.items()
    }


def _prepare_parent(home: Path, destination: Path) -> None:
    _reject_symlink_components(home, destination)
    destination.parent.mkdir(mode=0o755, parents=True, exist_ok=True)
    _reject_symlink_components(home, destination)
    if not destination.parent.is_dir():
        raise ValueError("destination parent is not a directory")


def _validate_destination(destination: Path) -> None:
    if _exists(destination) and (destination.is_symlink() or not destination.is_dir()):
        raise ValueError("existing plugin destination must be a non-symlink directory")


def _stage_package(release_root: Path, parent: Path) -> Path:
    stage = Path(tempfile.mkdtemp(prefix=".ai-usage-monitor.stage-", dir=parent))
    # Exact public mode is required for the installed plugin directory.
    os.chmod(stage, 0o755)  # noqa: S103
    try:
        for relative in _PACKAGE_FILES:
            source = release_root / relative
            _reject_symlink_components(release_root, source)
            if source.is_symlink() or not source.is_file():
                raise ValueError("release tree contains a missing or symlinked required file")
            target = stage / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            # Exact public mode is required for installed package directories.
            os.chmod(target.parent, 0o755)  # noqa: S103
            shutil.copyfile(source, target)
            os.chmod(target, 0o644)
        return stage
    except BaseException:
        _remove_tree(stage)
        raise


def _create_absent_marker(path: Path) -> None:
    path.touch(mode=0o600, exist_ok=False)


def install(release_root: Path, hermes_home: Path, backup_id: str) -> dict[str, Path]:
    """Install one unified tree and transactionally retire the exact legacy Desktop tree."""
    home = _canonical_home(hermes_home)
    release_root = _canonical_release_root(release_root)
    _validate_backup_id(backup_id)
    states = _state_paths(home, backup_id)

    for destination, backup, absent in states.values():
        _prepare_parent(home, destination)
        _validate_destination(destination)
        if _exists(backup) or _exists(absent):
            raise FileExistsError("selected backup state already exists")

    unified, unified_backup, unified_absent = states["unified"]
    legacy, legacy_backup, legacy_absent = states["legacy_desktop"]
    stage = _stage_package(release_root, unified.parent)
    unified_moved = False
    unified_installed = False
    legacy_moved = False

    try:
        if unified.exists():
            os.replace(unified, unified_backup)
            unified_moved = True
        else:
            _create_absent_marker(unified_absent)

        os.replace(stage, unified)
        unified_installed = True

        # Retire only the exact standalone Desktop copy, and only after the unified
        # package is installed. This prevents duplicate Desktop inventory.
        if legacy.exists():
            os.replace(legacy, legacy_backup)
            legacy_moved = True
        else:
            _create_absent_marker(legacy_absent)
    except BaseException:
        if legacy_moved and not legacy.exists():
            os.replace(legacy_backup, legacy)
        legacy_absent.unlink(missing_ok=True)
        if unified_installed:
            _remove_tree(unified)
        if unified_moved and not unified.exists():
            os.replace(unified_backup, unified)
        unified_absent.unlink(missing_ok=True)
        raise
    finally:
        _remove_tree(stage)

    return {"unified": unified_backup, "legacy_desktop": legacy_backup}


def rollback(hermes_home: Path, backup_id: str) -> None:
    """Transactionally restore the complete split-tree state recorded during installation."""
    home = _canonical_home(hermes_home)
    _validate_backup_id(backup_id)
    states = _state_paths(home, backup_id)
    had_backup: dict[str, bool] = {}

    for name, (destination, backup, absent) in states.items():
        _prepare_parent(home, destination)
        _validate_destination(destination)
        backup_valid = backup.is_dir() and not backup.is_symlink()
        absent_valid = absent.is_file() and not absent.is_symlink()
        if backup_valid == absent_valid:
            raise FileNotFoundError("complete selected backup state does not exist")
        had_backup[name] = backup_valid

    displaced: dict[str, Path] = {}
    restored: list[str] = []
    try:
        for name, (destination, backup, _absent) in states.items():
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
            destination, backup, _absent = states[name]
            if had_backup[name] and destination.exists():
                os.replace(destination, backup)
            if name in displaced and not destination.exists():
                os.replace(displaced[name], destination)
        raise
    else:
        for _name, (_destination, _backup, absent) in states.items():
            absent.unlink(missing_ok=True)
        for path in displaced.values():
            _remove_tree(path)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--hermes-home", required=True, type=Path)
    parser.add_argument("--backup-id", required=True)
    parser.add_argument("--rollback", action="store_true")
    args = parser.parse_args()
    if args.rollback:
        rollback(args.hermes_home, args.backup_id)
        print(f"Rolled back unified and legacy Desktop trees under {args.hermes_home}")
    else:
        install(Path(__file__).resolve().parent.parent, args.hermes_home, args.backup_id)
        print(
            f"Installed unified AI Usage package under {args.hermes_home}; "
            f"backup id: {args.backup_id}"
        )


if __name__ == "__main__":
    main()
