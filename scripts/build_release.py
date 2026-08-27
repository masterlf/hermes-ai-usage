#!/usr/bin/env python3
"""Build a byte-for-byte deterministic plugin release archive and checksum."""
from __future__ import annotations

import argparse
import gzip
import hashlib
import io
import json
import tarfile
from pathlib import Path

VERSION = "0.7.5"
FILES = (
    "plugin.yaml",
    "__init__.py",
    "CHANGELOG.md",
    "LICENSE",
    "NOTICE",
    "README.md",
    "dashboard/dist/index.js",
    "dashboard/dist/style.css",
    "dashboard/manifest.json",
    "dashboard/plugin_api.py",
    "desktop/plugin.js",
    "docs/INSTALLATION.md",
    "scripts/install_release.py",
)


def build(root: Path, output_dir: Path) -> tuple[Path, Path]:
    dashboard_manifest = json.loads(
        (root / "dashboard/manifest.json").read_text(encoding="utf-8")
    )
    plugin_manifest = (root / "plugin.yaml").read_text(encoding="utf-8")
    if dashboard_manifest.get("version") != VERSION:
        raise ValueError("Dashboard manifest version does not match release builder")
    if f"version: {VERSION}\n" not in plugin_manifest:
        raise ValueError("root manifest version does not match release builder")
    output_dir.mkdir(parents=True, exist_ok=True)
    archive = output_dir / f"hermes-ai-usage-v{VERSION}.tar.gz"
    buffer = io.BytesIO()
    with (
        gzip.GzipFile(filename="", mode="wb", fileobj=buffer, mtime=0) as compressed,
        tarfile.open(fileobj=compressed, mode="w", format=tarfile.PAX_FORMAT) as bundle,
    ):
        for relative in FILES:
            data = (root / relative).read_bytes()
            info = tarfile.TarInfo(f"hermes-ai-usage-v{VERSION}/{relative}")
            info.size = len(data)
            info.mode = 0o755 if relative == "scripts/install_release.py" else 0o644
            info.mtime = 0
            info.uid = info.gid = 0
            info.uname = info.gname = "root"
            bundle.addfile(info, io.BytesIO(data))
    archive.write_bytes(buffer.getvalue())
    digest = hashlib.sha256(buffer.getvalue()).hexdigest()
    checksum = output_dir / "SHA256SUMS"
    checksum.write_text(f"{digest}  {archive.name}\n", encoding="ascii")
    return archive, checksum


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", type=Path, default=Path("dist"))
    args = parser.parse_args()
    root = Path(__file__).resolve().parent.parent
    archive, checksum = build(root, args.output_dir.resolve())
    print(archive)
    print(checksum)


if __name__ == "__main__":
    main()
