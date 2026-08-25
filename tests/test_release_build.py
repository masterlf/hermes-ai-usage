from __future__ import annotations

import hashlib
import importlib.util
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SPEC = importlib.util.spec_from_file_location("build_release", ROOT / "scripts/build_release.py")
assert SPEC and SPEC.loader
build_release = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(build_release)


class ReleaseBuildTests(unittest.TestCase):
    def test_release_archive_is_deterministic_and_checksum_matches(self):
        with (
            tempfile.TemporaryDirectory() as first_tmp,
            tempfile.TemporaryDirectory() as second_tmp,
        ):
            first, first_checksum = build_release.build(ROOT, Path(first_tmp))
            second, second_checksum = build_release.build(ROOT, Path(second_tmp))

            self.assertEqual(first.read_bytes(), second.read_bytes())
            digest = hashlib.sha256(first.read_bytes()).hexdigest()
            self.assertEqual(
                first_checksum.read_text(encoding="ascii"),
                f"{digest}  {first.name}\n",
            )
            self.assertEqual(first_checksum.read_bytes(), second_checksum.read_bytes())


if __name__ == "__main__":
    unittest.main()
