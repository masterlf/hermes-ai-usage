from __future__ import annotations

import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WORKFLOW = ROOT / ".github/workflows/ci.yml"


class CIWorkflowTests(unittest.TestCase):
    def test_locked_node_dependencies_and_canonical_check_are_required(self):
        source = WORKFLOW.read_text(encoding="utf-8")
        self.assertIn("npm ci --ignore-scripts", source)
        self.assertIn("npm audit --audit-level=high", source)
        self.assertIn("make check", source)
        self.assertLess(source.index("npm ci --ignore-scripts"), source.index("make check"))


if __name__ == "__main__":
    unittest.main()
