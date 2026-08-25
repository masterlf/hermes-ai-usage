from __future__ import annotations

import hashlib
import importlib.util
import io
import tarfile
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

            with tarfile.open(fileobj=io.BytesIO(first.read_bytes()), mode="r:gz") as archive:
                members = archive.getmembers()
                prefix = f"hermes-ai-usage-v{build_release.VERSION}/"
                for member in members:
                    self.assertTrue(member.name.startswith(prefix))
                    relative = member.name.removeprefix(prefix)
                    self.assertNotIn("..", Path(relative).parts)
                    self.assertFalse(Path(relative).is_absolute())
                    self.assertTrue(member.isfile())
                    expected_mode = 0o755 if relative == "scripts/install_release.py" else 0o644
                    self.assertEqual(member.mode, expected_mode)


if __name__ == "__main__":
    unittest.main()
