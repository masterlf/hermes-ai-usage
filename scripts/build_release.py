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

VERSION = "0.7.3"
FILES = (
    "CHANGELOG.md",
    "LICENSE",
    "NOTICE",
    "README.md",
    "desktop/plugin.js",
    "docs/INSTALLATION.md",
    "runtime/dashboard/dist/index.js",
    "runtime/dashboard/dist/style.css",
    "runtime/dashboard/manifest.json",
    "runtime/dashboard/plugin_api.py",
)


def build(root: Path, output_dir: Path) -> tuple[Path, Path]:
    manifest = json.loads((root / "runtime/dashboard/manifest.json").read_text(encoding="utf-8"))
    if manifest.get("version") != VERSION:
        raise ValueError("manifest version does not match release builder")
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
            info.mode = 0o644
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
