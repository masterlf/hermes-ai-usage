#!/usr/bin/env python3
"""Fail CI when the plugin's privacy/read-only invariants regress."""
from __future__ import annotations

import ast
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
API = ROOT / "runtime/dashboard/plugin_api.py"
JS_FILES = [ROOT / "desktop/plugin.js", ROOT / "runtime/dashboard/dist/index.js"]
FORBIDDEN_JS = {
    "innerHTML": "raw HTML sink",
    "outerHTML": "raw HTML sink",
    "insertAdjacentHTML": "raw HTML sink",
    "dangerouslySetInnerHTML": "React raw HTML sink",
    "eval(": "dynamic code execution",
    "new Function": "dynamic code execution",
    "document.write": "document injection",
    "localStorage": "persistent browser storage",
    "sessionStorage": "browser storage",
    "postMessage": "cross-window messaging",
    "Authorization": "custom credential handling",
    "document.cookie": "cookie access",
}
HIGH_CONFIDENCE_SECRETS = [
    re.compile(r"gh[pousr]_[A-Za-z0-9]{30,}"),
    re.compile(r"sk-[A-Za-z0-9_-]{20,}"),
    re.compile(r"AKIA[0-9A-Z]{16}"),
    re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
]
FORBIDDEN_NAMES = {".env", "config.yaml", "state.db"}
FORBIDDEN_SUFFIXES = {".db", ".sqlite", ".sqlite3", ".pyc", ".log"}
IGNORED_PARTS = {".git", ".venv", "__pycache__", ".ruff_cache"}


def fail(message: str) -> None:
    print(f"SECURITY INVARIANT FAILED: {message}", file=sys.stderr)
    raise SystemExit(1)


def python_invariants() -> None:
    source = API.read_text(encoding="utf-8")
    tree = ast.parse(source)
    if "mode=ro" not in source or "PRAGMA query_only=ON" not in source:
        fail("SQLite must use both mode=ro and PRAGMA query_only=ON")
    if "get_hermes_home" not in source or "cache_key = (scope, provider)" not in source:
        fail("account cache must remain scoped to Hermes home/profile")
    if 'scope = "unknown"' in source:
        fail("account cache must not use a shared fallback profile scope")
    if "unicodedata.category(character)" not in source:
        fail("provider display text must strip invisible Unicode format characters")
    if "_SESSION_REF_WIDTHS = (12, 16, 20)" not in source:
        fail("session references must remain bounded and collision-aware")
    if "_SAFE_SESSION_REF_RE.fullmatch(reference)" not in source:
        fail("session references must remain restricted to safe ASCII characters")
    if "width > len(session_id) - 4" not in source:
        fail("session references must leave at least four identifier characters hidden")
    if "_global_session_ref_collisions(connection, returned_session_ids)" not in source:
        fail("session-reference collisions must be checked across the complete database")
    if "bucket_start: int | None = Query" not in source or '"rows_truncated"' not in source:
        fail("bucket drill-down must remain bounded and disclose truncation")
    if "COALESCE(ended_at, started_at) <= ?" not in source:
        fail("history totals and buckets must reject future-dated sessions")
    if 'session_id = str(row.pop("id", "") or "")' not in source:
        fail("complete session identifiers must be removed before serialization")
    if '"session_ref": references.get(session_id)' not in source:
        fail("history rows must expose only the bounded session reference")

    for node in ast.walk(tree):
        if isinstance(node, ast.Constant) and isinstance(node.value, str):
            value = node.value
            if re.search(r"\b(INSERT|UPDATE|DELETE|ALTER|DROP|CREATE)\b", value, re.I):
                fail("runtime Python contains a SQL mutation statement")
            if "SELECT" in value.upper() and re.search(
                r"\b(messages?|prompts?|content)\b", value, re.I
            ):
                fail("runtime SQL references message/prompt content")
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            names = [alias.name.split(".")[0] for alias in node.names]
            if {"subprocess", "pickle", "shelve"}.intersection(names):
                fail("runtime imports a prohibited execution/deserialization module")
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            for decorator in node.decorator_list:
                if (
                    isinstance(decorator, ast.Call)
                    and isinstance(decorator.func, ast.Attribute)
                    and decorator.func.attr.lower() in {"post", "put", "patch", "delete"}
                ):
                    fail(f"state-changing API method found on {node.name}")


def javascript_invariants() -> None:
    for path in JS_FILES:
        source = path.read_text(encoding="utf-8")
        for needle, reason in FORBIDDEN_JS.items():
            if needle in source:
                fail(f"{path.relative_to(ROOT)} contains {reason}: {needle}")
        if re.search(r"(?<![A-Za-z])fetch\s*\(", source):
            fail(f"{path.relative_to(ROOT)} uses direct fetch instead of the Hermes SDK")


def repository_invariants() -> None:
    for path in ROOT.rglob("*"):
        if any(part in IGNORED_PARTS for part in path.parts):
            continue
        relative = path.relative_to(ROOT)
        if path.is_symlink():
            fail(f"symlink is not permitted: {relative}")
        if not path.is_file():
            continue
        if path.name in FORBIDDEN_NAMES or path.suffix.lower() in FORBIDDEN_SUFFIXES:
            fail(f"runtime/local-state file is not permitted: {relative}")
        if path.stat().st_size > 500_000:
            fail(f"unexpected large file: {relative}")
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        for pattern in HIGH_CONFIDENCE_SECRETS:
            if pattern.search(text):
                fail(f"high-confidence secret pattern in {relative}")

    manifest = json.loads((ROOT / "runtime/dashboard/manifest.json").read_text(encoding="utf-8"))
    if manifest.get("name") != "ai-usage-monitor":
        fail("dashboard manifest name changed")
    tab = manifest.get("tab") or {}
    if tab.get("path") != "/ai-usage" or tab.get("hidden") is True:
        fail("dashboard tab must remain visible at /ai-usage")
    if manifest.get("api") != "plugin_api.py":
        fail("dashboard API entry changed")


def main() -> None:
    python_invariants()
    javascript_invariants()
    repository_invariants()
    print("security invariants: ok")


if __name__ == "__main__":
    main()
