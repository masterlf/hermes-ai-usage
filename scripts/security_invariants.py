#!/usr/bin/env python3
"""Fail CI when the plugin's privacy/read-only invariants regress."""
from __future__ import annotations

import ast
import json
import re
import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
API = ROOT / "dashboard/plugin_api.py"
JS_FILES = [ROOT / "desktop/plugin.js", ROOT / "dashboard/dist/index.js"]
RELEASE_WORKFLOW = ROOT / ".github/workflows/release.yml"
CI_WORKFLOW = ROOT / ".github/workflows/ci.yml"
PACKAGE = ROOT / "package.json"
MAKEFILE = ROOT / "Makefile"
INSTALLER = ROOT / "scripts/install_release.py"
VERSION = "0.7.4"
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
    for required in (
        'surface = _safe_surface(row.pop("source_raw", None))',
        '"source": surface',
        'stored_profile = _safe_profile(row.pop("profile_raw", None))',
        '"duration_seconds": duration_seconds',
        '"is_active": is_active',
    ):
        if required not in source:
            fail("session attribution must remain categorical, bounded, and privacy-safe")
    for required in (
        "get_default_hermes_root",
        "_PROFILE_HOME_RE.fullmatch(entry.name)",
        "stat.S_ISLNK",
        'profile_identity=profile',
        '"provider_quota_scope": "account_shared_not_attributed"',
        'pattern="^(current|all)$"',
    ):
        if required not in source:
            fail("all-profile access must remain explicit, canonical, and DB-home attributed")

    for node in ast.walk(tree):
        if isinstance(node, ast.Constant) and isinstance(node.value, str):
            value = node.value
            if "SELECT *" in value.upper():
                fail("runtime SQL must use explicit column allowlists")
            if re.search(r"\b(INSERT|UPDATE|DELETE|ALTER|DROP|CREATE)\b", value, re.I):
                fail("runtime Python contains a SQL mutation statement")
            if "SELECT" in value.upper() and re.search(
                r"\b(messages?|prompts?|content)\b", value, re.I
            ):
                fail("runtime SQL references message/prompt content")
            if "SELECT" in value.upper() and re.search(
                r"\b(title|cwd|system_prompt|origin_json|chat_id|thread_id|user_id)\b",
                value,
                re.I,
            ):
                fail("runtime SQL selects prohibited session metadata")
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


def find_stale_production_path(root: Path) -> Path | None:
    """Return the first non-historical file that names the obsolete production path."""
    forbidden = "runtime" + "/dashboard"
    for path in sorted(root.rglob("*")):
        if any(part in IGNORED_PARTS for part in path.parts) or not path.is_file():
            continue
        relative = path.relative_to(root)
        if relative == Path("CHANGELOG.md"):
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        if forbidden in text:
            return relative
    return None


def repository_invariants() -> None:
    workflow = RELEASE_WORKFLOW.read_text(encoding="utf-8")
    for required in (
        'git merge-base --is-ancestor "$GITHUB_SHA" "refs/remotes/origin/main"',
        "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1",
        "actions/setup-python@5fda3b95a4ea91299a34e894583c3862153e4b97",
        "python3 -m pip install --require-hashes -r requirements-dev.txt",
        "npm ci --ignore-scripts",
        "npm audit --audit-level=high",
        "make check",
        "actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02",
        "actions/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093",
        "actions/attest-build-provenance@96278af6caaf10aea03fd8d33a09a777ca52d62f",
    ):
        if required not in workflow:
            fail("release exact-SHA gate or privileged artifact handoff regressed")
    publish = workflow.split("  publish:", 1)[1]
    if "actions/checkout@" in publish or "npm " in publish or "make check" in publish:
        fail("privileged release publish job must not execute repository code")
    ci_workflow = CI_WORKFLOW.read_text(encoding="utf-8")
    for required in ("npm ci --ignore-scripts", "npm audit --audit-level=high", "make check"):
        if required not in ci_workflow:
            fail("CI locked dependency installation or canonical check regressed")
    package = json.loads(PACKAGE.read_text(encoding="utf-8"))
    if package.get("devDependencies") != {"fast-check": "4.9.0"}:
        fail("fast-check must remain an exact, development-only dependency")
    makefile = MAKEFILE.read_text(encoding="utf-8")
    if "npm run fuzz --silent" not in makefile or "npm audit --audit-level=high" not in makefile:
        fail("canonical fuzz or JavaScript dependency audit gate regressed")
    installer = INSTALLER.read_text(encoding="utf-8")
    for required in ("resolve(strict=True)", "lstat()", "os.replace", "except BaseException"):
        if required not in installer:
            fail("release installer path or transactional safety regressed")

    root_manifest = yaml.safe_load((ROOT / "plugin.yaml").read_text(encoding="utf-8"))
    if (
        root_manifest.get("name") != "ai-usage-monitor"
        or str(root_manifest.get("version")) != VERSION
    ):
        fail("root plugin identity or version changed")
    if root_manifest.get("manifest_version") != 1 or root_manifest.get("api_version") != 1:
        fail("root plugin manifest/API version changed")
    stale_path = find_stale_production_path(ROOT)
    if stale_path is not None:
        fail(f"obsolete production path reference is present in {stale_path}")

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

    manifest = json.loads((ROOT / "dashboard/manifest.json").read_text(encoding="utf-8"))
    if manifest.get("name") != "ai-usage-monitor":
        fail("dashboard manifest name changed")
    tab = manifest.get("tab") or {}
    if tab.get("path") != "/ai-usage" or tab.get("hidden") is True:
        fail("dashboard tab must remain visible at /ai-usage")
    if manifest.get("api") != "plugin_api.py":
        fail("dashboard API entry changed")
    if manifest.get("version") != VERSION:
        fail("dashboard version changed")
    if f"const VERSION = 'v{VERSION}'" not in (ROOT / "desktop/plugin.js").read_text(
        encoding="utf-8"
    ):
        fail("Desktop visible/runtime version changed")
    if f'const VERSION = "v{VERSION}"' not in (ROOT / "dashboard/dist/index.js").read_text(
        encoding="utf-8"
    ):
        fail("Dashboard visible version changed")
    if f'VERSION = "{VERSION}"' not in (ROOT / "scripts/build_release.py").read_text(
        encoding="utf-8"
    ):
        fail("release builder version changed")


def main() -> None:
    python_invariants()
    javascript_invariants()
    repository_invariants()
    print("security invariants: ok")


if __name__ == "__main__":
    main()
