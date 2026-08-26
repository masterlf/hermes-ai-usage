from __future__ import annotations

import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WORKFLOW = ROOT / ".github/workflows/release.yml"


class ReleaseWorkflowTests(unittest.TestCase):
    def setUp(self):
        self.source = WORKFLOW.read_text(encoding="utf-8")

    def test_exact_tagged_sha_is_gated_before_artifact_handoff(self):
        self.assertIn("git merge-base --is-ancestor", self.source)
        self.assertIn('"$GITHUB_SHA" "refs/remotes/origin/main"', self.source)
        self.assertIn("make check", self.source)
        self.assertIn("python3 scripts/build_release.py", self.source)
        self.assertIn(
            "actions/setup-python@5fda3b95a4ea91299a34e894583c3862153e4b97", self.source
        )
        self.assertIn(
            "python3 -m pip install --require-hashes -r requirements-dev.txt", self.source
        )
        self.assertLess(
            self.source.index("make check"), self.source.index("actions/upload-artifact@")
        )

    def test_unprivileged_build_is_separate_from_privileged_publish(self):
        self.assertIn("build-and-verify:", self.source)
        self.assertIn("publish:", self.source)
        build = self.source.split("build-and-verify:", 1)[1].split("publish:", 1)[0]
        publish = self.source.split("publish:", 1)[1]
        self.assertIn("contents: read", build)
        self.assertNotIn("contents: write", build)
        self.assertNotIn("id-token: write", build)
        self.assertIn("contents: write", publish)
        self.assertIn("id-token: write", publish)
        self.assertNotIn("actions/checkout@", publish)
        self.assertIn("sha256sum --check SHA256SUMS", publish)

    def test_action_pins_and_artifact_identity_are_exact(self):
        for pin in (
            "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1",  # v7.0.1
            "actions/setup-python@5fda3b95a4ea91299a34e894583c3862153e4b97",  # v7.0.0
            "actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02",  # v4.6.2
            "actions/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093",  # v4.3.0
            "actions/attest-build-provenance@96278af6caaf10aea03fd8d33a09a777ca52d62f",  # v3.2.0
        ):
            self.assertIn(pin, self.source)
        self.assertIn("release-${{ github.sha }}", self.source)
        self.assertIn("if-no-files-found: error", self.source)


if __name__ == "__main__":
    unittest.main()
