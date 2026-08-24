from __future__ import annotations

import importlib.util
import json
import sqlite3
import sys
import tempfile
import types
import unittest
from datetime import UTC, datetime
from pathlib import Path
from unittest import mock

from fastapi import FastAPI
from fastapi.testclient import TestClient

# The public test suite exercises this plugin without installing Hermes itself.
# Only import boundaries are stubbed; FastAPI, SQLite, and plugin behavior remain real.
agent_package = types.ModuleType("agent")
account_usage_module = types.ModuleType("agent.account_usage")
account_usage_module.AccountUsageSnapshot = object
account_usage_module.fetch_account_usage = lambda _provider: None
hermes_cli_package = types.ModuleType("hermes_cli")
config_module = types.ModuleType("hermes_cli.config")
config_module.load_config = lambda: {}
constants_module = types.ModuleType("hermes_constants")
constants_module.get_hermes_home = lambda: Path(tempfile.gettempdir()) / "hermes-test-home"
constants_module.get_default_hermes_root = constants_module.get_hermes_home
sys.modules.setdefault("agent", agent_package)
sys.modules.setdefault("agent.account_usage", account_usage_module)
sys.modules.setdefault("hermes_cli", hermes_cli_package)
sys.modules.setdefault("hermes_cli.config", config_module)
sys.modules.setdefault("hermes_constants", constants_module)

MODULE_PATH = Path(__file__).parents[1] / "runtime" / "dashboard" / "plugin_api.py"
spec = importlib.util.spec_from_file_location("ai_usage_monitor_plugin_api", MODULE_PATH)
module = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(module)


class FakeWindow:
    def __init__(self, label, used_percent, reset_at=None, detail=None):
        self.label = label
        self.used_percent = used_percent
        self.reset_at = reset_at
        self.detail = detail


class FakeSnapshot:
    provider = "openai-codex"
    source = "usage_api"
    title = "Account limits"
    plan = "Pro"
    fetched_at = datetime(2026, 7, 24, tzinfo=UTC)
    details = ("safe detail",)
    unavailable_reason = None
    available = True

    def __init__(self):
        self.windows = (
            FakeWindow("Session", 13.2, datetime(2026, 7, 25, tzinfo=UTC)),
            FakeWindow("Weekly", 140),
        )


class SerializationTests(unittest.TestCase):
    def test_serialization_calculates_remaining_and_clamps(self):
        payload = module._serialize_account(FakeSnapshot(), "openai-codex")
        self.assertTrue(payload["available"])
        self.assertEqual(payload["windows"][0]["remaining_percent"], 86.8)
        self.assertEqual(payload["windows"][1]["used_percent"], 100.0)
        self.assertEqual(payload["windows"][1]["remaining_percent"], 0.0)

    def test_display_text_removes_unicode_format_controls(self):
        text = module._safe_text("safe\u202esecret\u200b label")
        self.assertEqual(text, "safe secret label")

    def test_unsupported_provider_is_explicit(self):
        payload = module.snapshot("gemini")
        self.assertTrue(payload["ok"])
        self.assertFalse(payload["account"]["available"])
        self.assertIn("Token accounting remains available", payload["account"]["reason"])

    def test_provider_exception_is_not_reflected_to_client(self):
        module._account_cache.clear()

        def fail(_provider):
            raise RuntimeError("secret request metadata")

        with mock.patch.object(module, "fetch_account_usage", fail):
            payload = module.snapshot("openai-codex")
        module._account_cache.clear()

        self.assertFalse(payload["account"]["available"])
        self.assertNotIn("secret request metadata", payload["account"]["reason"])

    def test_account_cache_is_isolated_by_hermes_home(self):
        module._account_cache.clear()
        calls = []

        def fetch(provider):
            calls.append((str(module.get_hermes_home()), provider))
            return FakeSnapshot()

        with mock.patch.object(module, "fetch_account_usage", fetch):
            with mock.patch.object(module, "get_hermes_home", lambda: "/profiles/alpha"):
                module._cached_account_snapshot("openai-codex")
                module._cached_account_snapshot("openai-codex")
            with mock.patch.object(module, "get_hermes_home", lambda: "/profiles/bravo"):
                module._cached_account_snapshot("openai-codex")
        module._account_cache.clear()

        self.assertEqual(calls, [
            ("/profiles/alpha", "openai-codex"),
            ("/profiles/bravo", "openai-codex"),
        ])

    def test_account_cache_is_bypassed_when_profile_scope_fails(self):
        calls = []

        def fetch(provider):
            calls.append(provider)
            return FakeSnapshot()

        def fail_home():
            raise RuntimeError("profile unavailable")

        module._account_cache.clear()
        with (
            mock.patch.object(module, "fetch_account_usage", fetch),
            mock.patch.object(module, "get_hermes_home", fail_home),
        ):
            module._cached_account_snapshot("openai-codex")
            module._cached_account_snapshot("openai-codex")

        self.assertEqual(calls, ["openai-codex", "openai-codex"])
        self.assertEqual(module._account_cache, {})


class HistoryTests(unittest.TestCase):
    @staticmethod
    def _create_state_db(home: Path) -> None:
        db = sqlite3.connect(home / "state.db")
        db.execute(
            """CREATE TABLE sessions (
                id TEXT PRIMARY KEY, source TEXT, model TEXT, billing_provider TEXT,
                started_at REAL, ended_at REAL, input_tokens INTEGER,
                output_tokens INTEGER, cache_read_tokens INTEGER,
                cache_write_tokens INTEGER, reasoning_tokens INTEGER,
                api_call_count INTEGER, actual_cost_usd REAL,
                estimated_cost_usd REAL, cost_status TEXT
            )"""
        )
        db.commit()
        db.close()

    @staticmethod
    def _create_current_state_db(home: Path) -> None:
        db = sqlite3.connect(home / "state.db")
        db.execute(
            """CREATE TABLE sessions (
                id TEXT PRIMARY KEY, source TEXT, model TEXT, billing_provider TEXT,
                started_at REAL, ended_at REAL, input_tokens INTEGER,
                output_tokens INTEGER, cache_read_tokens INTEGER,
                cache_write_tokens INTEGER, reasoning_tokens INTEGER,
                api_call_count INTEGER, profile_name TEXT, parent_session_id TEXT,
                model_config TEXT, end_reason TEXT, title TEXT, cwd TEXT,
                system_prompt TEXT, chat_id TEXT
            )"""
        )
        db.commit()
        db.close()

    def test_privacy_safe_attribution_profile_and_duration(self):
        with tempfile.TemporaryDirectory() as tmp:
            home = Path(tmp)
            self._create_current_state_db(home)
            database = sqlite3.connect(home / "state.db")
            database.executemany(
                """INSERT INTO sessions VALUES (
                    ?, ?, 'gpt-test', 'openai-codex', ?, ?, 10, 5, 0, 0, 1, 1,
                    ?, ?, ?, ?, ?, ?, ?, ?
                )""",
                [
                    (
                        "cron_secret-job_123456789012", " cron ", 1000, 1042.9,
                        "ops-1", None, None, None, "customer cron title",
                        "/secret/path", "secret prompt", "secret-chat",
                    ),
                    (
                        "child_session_abcdefghijkl", "CLI", 1100, None,
                        "security.dev", "missing-parent",
                        '{"_delegate_from":"secret-parent-id"}', None,
                        "customer delegate goal", "/private", "prompt data", "chat-2",
                    ),
                    (
                        "hostile_source_zyxwvutsrqpo", "desktop-customer", 1200, 1199,
                        "bad profile", None, "not json", None,
                        "incident Red Wolf", "/srv/customer", "classified", "chat-3",
                    ),
                ],
            )
            database.commit()
            database.close()

            with (
                mock.patch.object(module, "get_hermes_home", lambda: home),
                mock.patch.object(module.time, "time", return_value=1300),
            ):
                payload = module._token_history(7, 30)

        scheduled = next(row for row in payload["rows"] if row["surface"] == "cron")
        delegated = next(
            row for row in payload["rows"] if row["workload_type"] == "subagent"
        )
        hostile = next(row for row in payload["rows"] if row["surface"] == "other")
        self.assertEqual(scheduled["source"], "cron")
        self.assertEqual(scheduled["workload_type"], "scheduled")
        self.assertEqual(scheduled["profile"], "ops-1")
        self.assertEqual(scheduled["duration_seconds"], 42)
        self.assertFalse(scheduled["is_active"])
        self.assertEqual(delegated["surface"], "cli")
        self.assertEqual(delegated["profile"], "security.dev")
        self.assertEqual(delegated["duration_seconds"], 200)
        self.assertTrue(delegated["is_active"])
        self.assertIsNone(hostile["profile"])
        self.assertIsNone(hostile["duration_seconds"])
        self.assertFalse(hostile["is_active"])
        serialized = json.dumps(payload)
        for secret in (
            "desktop-customer", "customer cron title", "customer delegate goal",
            "secret-parent-id", "/secret/path", "/private", "secret prompt",
            "prompt data", "secret-chat", "incident Red Wolf", "classified",
        ):
            self.assertNotIn(secret, serialized)

    def test_optional_session_columns_fail_closed_with_stable_shape(self):
        with tempfile.TemporaryDirectory() as tmp:
            home = Path(tmp)
            self._create_state_db(home)
            database = sqlite3.connect(home / "state.db")
            database.execute(
                """INSERT INTO sessions VALUES (
                    'legacy_session_abcd12345678', 'desktop', 'gpt-test', 'openai-codex',
                    1000, 1010, 10, 5, 0, 0, 1, 1, NULL, 0, 'estimated'
                )"""
            )
            database.commit()
            database.close()
            with (
                mock.patch.object(module, "get_hermes_home", lambda: home),
                mock.patch.object(module.time, "time", return_value=1100),
            ):
                row = module._token_history(7, 30)["rows"][0]

        self.assertEqual(row["surface"], "desktop")
        self.assertEqual(row["source"], "desktop")
        self.assertEqual(row["workload_type"], "interactive")
        self.assertIsNone(row["profile"])
        self.assertEqual(row["duration_seconds"], 10)
        self.assertFalse(row["is_active"])

    def test_branch_classification_supports_stable_and_legacy_markers(self):
        with tempfile.TemporaryDirectory() as tmp:
            home = Path(tmp)
            self._create_current_state_db(home)
            database = sqlite3.connect(home / "state.db")

            def session(
                session_id,
                started_at,
                ended_at,
                parent_id=None,
                model_config=None,
                end_reason=None,
            ):
                return (
                    session_id, "cli", "gpt-test", "openai-codex",
                    started_at, ended_at, 10, 5, 0, 0, 1, 1,
                    "default", parent_id, model_config, end_reason,
                    None, None, None, None,
                )

            database.executemany(
                """INSERT INTO sessions VALUES (
                    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
                )""",
                [
                    session("legacy_parent_aaaa12345678", 900, 1000, end_reason="branched"),
                    session(
                        "legacy_child_bbbb12345678", 1000, 1010,
                        parent_id="legacy_parent_aaaa12345678",
                    ),
                    session("stable_parent_cccc12345678", 900, 1000),
                    session(
                        "stable_child_dddd12345678", 1000, 1010,
                        parent_id="stable_parent_cccc12345678",
                        model_config='{"_branched_from":"stable-parent"}',
                    ),
                    session("compression_parent_eeee12345678", 900, 1000, end_reason="compression"),
                    session(
                        "compression_child_ffff12345678", 1000, 1010,
                        parent_id="compression_parent_eeee12345678",
                    ),
                    session(
                        "delegate_child_gggg12345678", 1000, 1010,
                        parent_id="legacy_parent_aaaa12345678",
                        model_config='{"_delegate_from":"delegate-parent"}',
                    ),
                ],
            )
            database.commit()
            database.close()

            with (
                mock.patch.object(module, "get_hermes_home", lambda: home),
                mock.patch.object(module.time, "time", return_value=1100),
            ):
                rows = module._token_history(7, 30)["rows"]

        types = {row["session_ref"]: row["workload_type"] for row in rows}
        self.assertEqual(types["bbbb12345678"], "branch")
        self.assertEqual(types["dddd12345678"], "branch")
        self.assertEqual(types["ffff12345678"], "continuation")
        self.assertEqual(types["gggg12345678"], "subagent")

    def test_history_reads_counters_without_message_content(self):
        with tempfile.TemporaryDirectory() as tmp:
            home = Path(tmp)
            self._create_state_db(home)
            db = sqlite3.connect(home / "state.db")
            db.execute(
                """INSERT INTO sessions VALUES (
                    '20260724_120000_abcd12345678', 'desktop', 'gpt-test', 'openai-codex',
                    strftime('%s','now'), strftime('%s','now'),
                    100, 20, 300, 5, 10, 4, NULL, 0.12, 'estimated'
                )"""
            )
            db.execute(
                """INSERT INTO sessions VALUES (
                    '20260724_120100_wxyz87654321', 'desktop', 'gpt-test', 'openai-codex',
                    strftime('%s','now'), strftime('%s','now'),
                    10, 0, 0, 0, 0, 1, NULL, 0.0, 'estimated'
                )"""
            )
            db.commit()
            db.close()

            with mock.patch.object(module, "get_hermes_home", lambda: home):
                payload = module._token_history(7, 1)

        self.assertTrue(payload["available"])
        self.assertEqual(len(payload["rows"]), 1)
        self.assertEqual(payload["totals"]["sessions"], 2)
        self.assertEqual(payload["totals"]["total_tokens"], 435)
        self.assertEqual(payload["rows"][0]["provider"], "openai-codex")
        self.assertIn(payload["rows"][0]["session_ref"], {"abcd12345678", "wxyz87654321"})
        self.assertNotIn("id", payload["rows"][0])
        self.assertNotIn("cost_usd", payload["rows"][0])
        self.assertNotIn("content", payload["rows"][0])
        self.assertNotIn("prompt", payload["rows"][0])
        serialized = json.dumps(payload)
        self.assertNotIn("20260724_120000_abcd12345678", serialized)
        self.assertNotIn("20260724_120100_wxyz87654321", serialized)
        self.assertEqual(payload["series"]["bucket"], "day")
        self.assertEqual(payload["series"]["timezone"], "UTC")
        self.assertGreaterEqual(len(payload["series"]["points"]), 7)
        self.assertTrue(any(point["total_tokens"] == 0 for point in payload["series"]["points"]))
        point = next(point for point in payload["series"]["points"] if point["total_tokens"])
        self.assertEqual(point["input_tokens"], 110)
        self.assertEqual(point["output_tokens"], 20)
        self.assertEqual(point["reasoning_tokens"], 10)
        self.assertEqual(point["total_tokens"], 435)

    def test_one_day_history_uses_hourly_buckets(self):
        with tempfile.TemporaryDirectory() as tmp:
            home = Path(tmp)
            self._create_state_db(home)
            database = sqlite3.connect(home / "state.db")
            database.execute(
                """INSERT INTO sessions VALUES (
                    '20260724_120000_hour12345678', 'desktop', 'gpt-test', 'openai-codex',
                    strftime('%s','now'), strftime('%s','now'),
                    10, 5, 0, 0, 1, 1, NULL, 0.0, 'estimated'
                )"""
            )
            database.commit()
            database.close()

            with mock.patch.object(module, "get_hermes_home", lambda: home):
                payload = module._token_history(1, 30)

        self.assertEqual(payload["series"]["bucket"], "hour")
        self.assertEqual(payload["series"]["bucket_seconds"], 3600)

    def test_session_references_extend_on_suffix_collision_without_exposing_full_id(self):
        alpha = "20260724_120000_alpha_same12345678"
        bravo = "cron_job_bravo_same12345678"
        unique = "20260724_120100_unique87654321"

        references = module._session_references([alpha, bravo, unique])

        self.assertEqual(references[unique], "ique87654321")
        self.assertEqual(len(references[alpha]), 16)
        self.assertEqual(len(references[bravo]), 16)
        self.assertNotEqual(references[alpha], references[bravo])
        self.assertNotEqual(references[alpha], alpha)
        self.assertNotEqual(references[bravo], bravo)

        unsafe = "20260724_120200_bad\u202eref12345678"
        self.assertNotIn(unsafe, module._session_references([unsafe]))

        complete_twelve_character_id = "abcdefghijkl"
        self.assertNotIn(
            complete_twelve_character_id,
            module._session_references([complete_twelve_character_id]),
        )

        nearly_complete_thirteen_character_id = "a123456789012"
        self.assertNotIn(
            nearly_complete_thirteen_character_id,
            module._session_references([nearly_complete_thirteen_character_id]),
        )

        outside_page_collision = "new_AAAAsame12345678"
        references = module._session_references(
            [outside_page_collision],
            {12: {"same12345678"}},
        )
        self.assertEqual(len(references[outside_page_collision]), 16)

    def test_history_extends_reference_for_collision_outside_returned_page(self):
        with tempfile.TemporaryDirectory() as tmp:
            home = Path(tmp)
            self._create_state_db(home)
            database = sqlite3.connect(home / "state.db")
            database.executemany(
                """INSERT INTO sessions VALUES (
                    ?, 'desktop', 'gpt-test', 'openai-codex',
                    strftime('%s','now') + ?, strftime('%s','now') + ?,
                    10, 5, 0, 0, 1, 1, NULL, 0.0, 'estimated'
                )""",
                [
                    ("older_AAAAsame12345678", -10, -10),
                    ("newer_BBBBsame12345678", 0, 0),
                ],
            )
            database.commit()
            database.close()

            with mock.patch.object(module, "get_hermes_home", lambda: home):
                payload = module._token_history(7, 1)

        self.assertEqual(len(payload["rows"]), 1)
        self.assertEqual(len(payload["rows"][0]["session_ref"]), 16)
        self.assertNotEqual(payload["rows"][0]["session_ref"], "same12345678")

    def test_global_collision_lookup_skips_sql_for_empty_or_invalid_candidates(self):
        class NoExecuteConnection:
            def execute(self, _sql):
                raise AssertionError("execute must not be called without valid suffix candidates")

        expected = {width: set() for width in module._SESSION_REF_WIDTHS}

        self.assertEqual(
            module._global_session_ref_collisions(NoExecuteConnection(), []),
            expected,
        )
        self.assertEqual(
            module._global_session_ref_collisions(
                NoExecuteConnection(),
                ["short", "abcdefghijkl", "prefix_bad\u202eref12345678"],
            ),
            expected,
        )

    def test_history_uses_end_time_excludes_future_and_reports_truncation(self):
        with tempfile.TemporaryDirectory() as tmp:
            home = Path(tmp)
            self._create_state_db(home)
            database = sqlite3.connect(home / "state.db")
            database.executemany(
                """INSERT INTO sessions VALUES (
                    ?, 'desktop', 'gpt-test', 'openai-codex', ?, ?,
                    ?, 0, 0, 0, 1, 1, NULL, 0.0, 'estimated'
                )""",
                [
                    ("long_session_alpha12345678", -90000, 1000, 10),
                    ("normal_session_bravo12345678", 900, 1000, 20),
                    ("normal_session_charlie12345678", 950, 1000, 30),
                    ("future_session_delta12345678", 3000, 3000, 40),
                ],
            )
            database.commit()
            database.close()

            with (
                mock.patch.object(module, "get_hermes_home", lambda: home),
                mock.patch.object(module.time, "time", return_value=2000),
            ):
                payload = module._token_history(1, 2, 0)

        self.assertEqual(payload["totals"]["sessions"], 3)
        self.assertEqual(payload["totals"]["total_tokens"], 60)
        self.assertEqual(sum(point["total_tokens"] for point in payload["series"]["points"]), 60)
        self.assertEqual(payload["row_count"], 3)
        self.assertTrue(payload["rows_truncated"])
        self.assertEqual(payload["selected_bucket_start"], 0)
        self.assertEqual(len(payload["rows"]), 2)

    def test_negative_counts_are_clamped_before_aggregation(self):
        with tempfile.TemporaryDirectory() as tmp:
            home = Path(tmp)
            self._create_state_db(home)
            database = sqlite3.connect(home / "state.db")
            database.executemany(
                """INSERT INTO sessions VALUES (
                    ?, 'cli', 'model', 'provider',
                    strftime('%s','now'), strftime('%s','now'),
                    ?, ?, 0, 0, ?, ?, NULL, 0.0, 'estimated'
                )""",
                [
                    ("20260724_160000_negative12345678", -10, 20, 30, -5),
                    ("20260724_160100_positive12345678", 30, 5, 3, 3),
                    ("20260724_160200_reasoning12345678", 0, 10, 100, 1),
                ],
            )
            database.commit()
            database.close()

            with mock.patch.object(module, "get_hermes_home", lambda: home):
                payload = module._token_history(7, 30)

        normalized_api_calls = sum(row["api_call_count"] for row in payload["rows"])
        self.assertTrue(
            all(row["reasoning_tokens"] <= row["output_tokens"] for row in payload["rows"])
        )
        self.assertTrue(
            all(
                point["reasoning_tokens"] <= point["output_tokens"]
                for point in payload["series"]["points"]
            )
        )
        self.assertLessEqual(
            payload["totals"]["reasoning_tokens"],
            payload["totals"]["output_tokens"],
        )
        self.assertEqual(sum(row["total_tokens"] for row in payload["rows"]), 65)
        self.assertEqual(payload["totals"]["total_tokens"], 65)
        self.assertEqual(sum(point["total_tokens"] for point in payload["series"]["points"]), 65)
        self.assertEqual(payload["totals"]["input_tokens"], 30)
        self.assertEqual(payload["totals"]["output_tokens"], 35)
        self.assertEqual(sum(row["reasoning_tokens"] for row in payload["rows"]), 33)
        self.assertEqual(payload["totals"]["reasoning_tokens"], 33)
        self.assertEqual(
            sum(point["reasoning_tokens"] for point in payload["series"]["points"]),
            33,
        )
        self.assertEqual(normalized_api_calls, 4)
        self.assertEqual(payload["totals"]["api_calls"], normalized_api_calls)
        self.assertEqual(
            sum(point["api_calls"] for point in payload["series"]["points"]),
            normalized_api_calls,
        )

    def test_normalise_token_counts_bounds_reasoning_to_output(self):
        normalized = module._normalise_token_counts(
            {
                "input_tokens": -5,
                "output_tokens": 7,
                "cache_read_tokens": 0,
                "cache_write_tokens": 0,
                "reasoning_tokens": 11,
            }
        )

        self.assertEqual(normalized["input_tokens"], 0)
        self.assertEqual(normalized["output_tokens"], 7)
        self.assertEqual(normalized["reasoning_tokens"], 7)
        self.assertEqual(normalized["total_tokens"], 7)

    def test_previous_boundary_bucket_has_one_bucket_of_clock_grace(self):
        with tempfile.TemporaryDirectory() as tmp:
            home = Path(tmp)
            self._create_state_db(home)
            with (
                mock.patch.object(module, "get_hermes_home", lambda: home),
                mock.patch.object(module.time, "time", return_value=8 * 86400),
            ):
                payload = module._token_history(7, 30, 0)

        self.assertTrue(payload["available"])
        self.assertEqual(payload["selected_bucket_start"], 0)
        with (
            mock.patch.object(module.time, "time", return_value=8 * 86400),
            self.assertRaises(ValueError),
        ):
            module._token_history(7, 30, -86400)

    def test_history_error_does_not_reflect_database_details(self):
        with tempfile.TemporaryDirectory() as tmp:
            home = Path(tmp)
            (home / "state.db").touch()
            def fail_connection(_path):
                raise sqlite3.OperationalError("secret filesystem detail")

            with (
                mock.patch.object(module, "get_hermes_home", lambda: home),
                mock.patch.object(module, "_readonly_connection", fail_connection),
            ):
                payload = module._token_history(7, 30)

        self.assertFalse(payload["available"])
        self.assertNotIn("secret filesystem detail", payload["reason"])

    def test_current_profile_ownership_uses_canonical_default_database_not_stored_label(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._create_current_state_db(root)
            database = sqlite3.connect(root / "state.db")
            database.execute(
                """INSERT INTO sessions VALUES (
                    'default_current_session_12345678', 'cli', 'gpt-test', 'openai-codex',
                    1000, 1010, 10, 0, 0, 0, 0, 1, 'spoofed', NULL, NULL, NULL,
                    'secret title', '/secret/path', 'secret prompt', 'secret-chat'
                )"""
            )
            database.commit()
            database.close()
            with (
                mock.patch.object(module, "get_default_hermes_root", lambda: root),
                mock.patch.object(module, "get_hermes_home", lambda: root),
                mock.patch.object(module.time, "time", return_value=1100),
            ):
                payload = module._current_profile_history(7, 30)

        self.assertEqual(payload["profile_scope"], "current")
        self.assertEqual(payload["profiles"][0]["profile"], "default")
        self.assertEqual(payload["profiles"][0]["total_tokens"], 10)
        self.assertEqual(payload["rows"][0]["profile"], "default")
        self.assertNotIn("spoofed", json.dumps(payload))

    def test_current_named_profile_and_zero_usage_remain_explicit(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            alpha = root / "profiles" / "alpha"
            alpha.mkdir(parents=True)
            self._create_state_db(alpha)
            with (
                mock.patch.object(module, "get_default_hermes_root", lambda: root),
                mock.patch.object(module, "get_hermes_home", lambda: alpha),
            ):
                payload = module._current_profile_history(7, 30)

        self.assertTrue(payload["available"])
        self.assertEqual(payload["profile_scope"], "current")
        self.assertEqual(
            payload["profiles"],
            [{
                "profile": "alpha",
                "sessions": 0,
                "api_calls": 0,
                "input_tokens": 0,
                "output_tokens": 0,
                "cache_read_tokens": 0,
                "cache_write_tokens": 0,
                "reasoning_tokens": 0,
                "total_tokens": 0,
            }],
        )

    def test_current_profile_identity_rejects_outside_noncanonical_and_symlink_paths(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "root"
            profiles = root / "profiles"
            alpha = profiles / "alpha"
            outside = Path(tmp) / "outside"
            alpha.mkdir(parents=True)
            outside.mkdir()
            self._create_state_db(alpha)
            self._create_state_db(outside)
            linked = profiles / "linked"
            linked.symlink_to(outside, target_is_directory=True)
            uppercase = profiles / "UpperCase"
            uppercase.mkdir()
            self._create_state_db(uppercase)
            database_link_home = profiles / "db-link"
            database_link_home.mkdir()
            (database_link_home / "state.db").symlink_to(outside / "state.db")
            with mock.patch.object(module, "get_default_hermes_root", lambda: root):
                self.assertIsNone(module._current_profile_identity(outside / "state.db"))
                self.assertIsNone(module._current_profile_identity(linked / "state.db"))
                self.assertIsNone(module._current_profile_identity(uppercase / "state.db"))
                self.assertIsNone(
                    module._current_profile_identity(database_link_home / "state.db")
                )
                self.assertEqual(module._current_profile_identity(alpha / "state.db"), "alpha")

    def test_invalid_current_path_omits_ownership_and_stored_profile_attribution(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "root"
            outside = Path(tmp) / "outside"
            root.mkdir()
            outside.mkdir()
            self._create_current_state_db(outside)
            database = sqlite3.connect(outside / "state.db")
            database.execute(
                """INSERT INTO sessions VALUES (
                    'outside_current_session_12345678', 'cli', 'gpt-test', 'openai-codex',
                    1000, 1010, 10, 0, 0, 0, 0, 1, 'trusted-looking', NULL, NULL, NULL,
                    NULL, NULL, NULL, NULL
                )"""
            )
            database.commit()
            database.close()
            with (
                mock.patch.object(module, "get_default_hermes_root", lambda: root),
                mock.patch.object(module, "get_hermes_home", lambda: outside),
                mock.patch.object(module.time, "time", return_value=1100),
            ):
                payload = module._current_profile_history(7, 30)

        self.assertEqual(payload["profile_scope"], "current")
        self.assertNotIn("profiles", payload)
        self.assertIsNone(payload["rows"][0]["profile"])
        self.assertNotIn("trusted-looking", json.dumps(payload))

    def test_connection_rejects_writes(self):
        with tempfile.TemporaryDirectory() as tmp:
            home = Path(tmp)
            self._create_state_db(home)
            connection = module._readonly_connection(home / "state.db")
            try:
                with self.assertRaises(sqlite3.OperationalError):
                    connection.execute("INSERT INTO sessions (id) VALUES ('forbidden')")
            finally:
                connection.close()

    def test_all_profiles_uses_database_home_identity_and_tolerates_failure(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            profiles = root / "profiles"
            alpha = profiles / "alpha"
            broken = profiles / "broken"
            alpha.mkdir(parents=True)
            broken.mkdir()
            self._create_current_state_db(root)
            self._create_current_state_db(alpha)
            (broken / "state.db").write_text("not sqlite", encoding="utf-8")

            def insert(home: Path, session_id: str, tokens: int, stored_profile: str) -> None:
                database = sqlite3.connect(home / "state.db")
                database.execute(
                    """INSERT INTO sessions VALUES (
                        ?, 'cli', 'gpt-test', 'openai-codex', 1000, 1010,
                        ?, 0, 0, 0, 0, 2, ?, NULL, NULL, NULL, 'secret title',
                        '/secret/path', 'secret prompt', 'secret-chat'
                    )""",
                    (session_id, tokens, stored_profile),
                )
                database.commit()
                database.close()

            insert(root, "default_session_abcd12345678", 10, "spoofed")
            insert(alpha, "alpha_session_wxyz12345678", 30, "default")
            with (
                mock.patch.object(module, "get_default_hermes_root", lambda: root),
                mock.patch.object(module.time, "time", return_value=1100),
            ):
                payload = module._all_profiles_history(7, 200)

        self.assertTrue(payload["available"])
        self.assertTrue(payload["partial"])
        self.assertFalse(payload["totals_complete"])
        self.assertEqual(payload["profiles_considered"], 3)
        self.assertEqual(payload["profiles_succeeded"], 2)
        self.assertEqual(payload["totals"]["total_tokens"], 40)
        self.assertEqual(
            [(item["profile"], item["total_tokens"]) for item in payload["profiles"]],
            [("alpha", 30), ("default", 10)],
        )
        self.assertEqual({row["profile"] for row in payload["rows"]}, {"default", "alpha"})
        self.assertIn(
            {"profile": "broken", "code": "database_unavailable"},
            payload["profile_failures"],
        )
        serialized = json.dumps(payload)
        for secret in ("spoofed", "secret title", "/secret/path", "secret prompt", "secret-chat"):
            self.assertNotIn(secret, serialized)

    def test_profile_discovery_rejects_symlinks_and_invalid_slugs(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            profiles = root / "profiles"
            outside = root / "outside"
            profiles.mkdir()
            outside.mkdir()
            self._create_state_db(root)
            self._create_state_db(outside)
            (profiles / "linked").symlink_to(outside, target_is_directory=True)
            (profiles / "UpperCase").mkdir()
            with mock.patch.object(module, "get_default_hermes_root", lambda: root):
                candidates, failures, truncated = module._discover_profile_databases()

        self.assertEqual(
            [(profile, path.name) for profile, path in candidates],
            [("default", "state.db")],
        )
        self.assertIn({"profile": "linked", "code": "unsafe_profile_path"}, failures)
        self.assertFalse(truncated)

    def test_profile_discovery_rejects_duplicate_hardlinked_database_before_query(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            alpha = root / "profiles" / "alpha"
            alpha.mkdir(parents=True)
            self._create_state_db(root)
            (alpha / "state.db").hardlink_to(root / "state.db")

            original_connection = module._readonly_connection
            with (
                mock.patch.object(module, "get_default_hermes_root", lambda: root),
                mock.patch.object(module.time, "time", return_value=1100),
                mock.patch.object(
                    module,
                    "_readonly_connection",
                    wraps=original_connection,
                ) as readonly_connection,
            ):
                payload = module._all_profiles_history(7, 200)

        self.assertEqual(readonly_connection.call_count, 2)
        self.assertTrue(payload["partial"])
        self.assertFalse(payload["totals_complete"])
        self.assertEqual([item["profile"] for item in payload["profiles"]], ["default"])
        self.assertIn(
            {"profile": "alpha", "code": "duplicate_database_identity"},
            payload["profile_failures"],
        )

    def test_all_profiles_excludes_every_database_with_duplicate_full_session_id(self):
        duplicate_id = "copied_history_secret_abcd12345678"
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            alpha = root / "profiles" / "alpha"
            alpha.mkdir(parents=True)
            self._create_state_db(root)
            self._create_state_db(alpha)
            for home, tokens in ((root, 10), (alpha, 30)):
                database = sqlite3.connect(home / "state.db")
                database.execute(
                    """INSERT INTO sessions VALUES (
                        ?, 'cli', 'gpt-test', 'openai-codex', 1000, 1010,
                        ?, 0, 0, 0, 0, 1, NULL, 0.0, 'estimated'
                    )""",
                    (duplicate_id, tokens),
                )
                database.commit()
                database.close()

            with (
                mock.patch.object(module, "get_default_hermes_root", lambda: root),
                mock.patch.object(module.time, "time", return_value=1100),
            ):
                payload = module._all_profiles_history(7, 200)

        self.assertFalse(payload["available"])
        self.assertTrue(payload["partial"])
        self.assertFalse(payload["totals_complete"])
        self.assertEqual(payload["totals"], {})
        self.assertEqual(payload["profiles"], [])
        self.assertEqual(
            payload["profile_failures"],
            [
                {"profile": "alpha", "code": "duplicate_session_identity"},
                {"profile": "default", "code": "duplicate_session_identity"},
            ],
        )
        self.assertNotIn(duplicate_id, json.dumps(payload))

    def test_profile_directory_raw_scan_is_bounded_for_valid_entries(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            profiles = root / "profiles"
            profiles.mkdir()
            self._create_state_db(root)
            for name in ("charlie", "alpha", "bravo", "delta"):
                home = profiles / name
                home.mkdir()
                self._create_state_db(home)

            with (
                mock.patch.object(module, "get_default_hermes_root", lambda: root),
                mock.patch.object(module, "_MAX_PROFILE_SCAN_ENTRIES", 3),
            ):
                candidates, failures, truncated = module._discover_profile_databases()

        accepted = [profile for profile, _path in candidates]
        self.assertEqual(accepted[0], "default")
        self.assertEqual(accepted[1:], sorted(accepted[1:]))
        self.assertEqual(len(accepted), 4)
        self.assertEqual(failures, [{"profile": None, "code": "profiles_directory_truncated"}])
        self.assertTrue(truncated)

    def test_profile_directory_scan_stops_consuming_and_closes_scandir(self):
        class ControlledScandir:
            def __init__(self, entries):
                self._entries = iter(entries)
                self.consumed = 0
                self.closed = False

            def __enter__(self):
                return self

            def __exit__(self, _exc_type, _exc, _traceback):
                self.closed = True

            def __iter__(self):
                return self

            def __next__(self):
                entry = next(self._entries)
                self.consumed += 1
                return entry

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            profiles = root / "profiles"
            profiles.mkdir()
            self._create_state_db(root)
            names = ("charlie", "alpha", "bravo", "delta", "echo")
            for name in names:
                home = profiles / name
                home.mkdir()
                self._create_state_db(home)
            scandir = ControlledScandir(
                [types.SimpleNamespace(name=name, path=str(profiles / name)) for name in names]
            )

            with (
                mock.patch.object(module, "get_default_hermes_root", lambda: root),
                mock.patch.object(module, "_MAX_PROFILE_SCAN_ENTRIES", 3),
                mock.patch.object(
                    module,
                    "os",
                    types.SimpleNamespace(scandir=lambda _path: scandir),
                    create=True,
                ),
            ):
                candidates, failures, truncated = module._discover_profile_databases()

        self.assertEqual(scandir.consumed, 4)
        self.assertTrue(scandir.closed)
        self.assertEqual(
            [profile for profile, _path in candidates],
            ["default", "alpha", "bravo", "charlie"],
        )
        self.assertEqual(failures, [{"profile": None, "code": "profiles_directory_truncated"}])
        self.assertTrue(truncated)

    def test_profile_directory_raw_scan_is_bounded_for_invalid_entries(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            profiles = root / "profiles"
            profiles.mkdir()
            self._create_state_db(root)
            for name in ("InvalidA", "InvalidB", "InvalidC", "InvalidD"):
                (profiles / name).mkdir()

            with (
                mock.patch.object(module, "get_default_hermes_root", lambda: root),
                mock.patch.object(module, "_MAX_PROFILE_SCAN_ENTRIES", 3),
            ):
                candidates, failures, truncated = module._discover_profile_databases()

        self.assertEqual([profile for profile, _path in candidates], ["default"])
        self.assertEqual(failures, [{"profile": None, "code": "profiles_directory_truncated"}])
        self.assertTrue(truncated)

    def test_all_profiles_fails_closed_when_session_identity_scan_is_truncated(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._create_state_db(root)
            database = sqlite3.connect(root / "state.db")
            database.executemany(
                """INSERT INTO sessions VALUES (
                    ?, 'cli', 'gpt-test', 'openai-codex', 1000, 1010,
                    1, 0, 0, 0, 0, 1, NULL, 0.0, 'estimated'
                )""",
                [("bounded_scan_alpha12345678",), ("bounded_scan_bravo12345678",)],
            )
            database.commit()
            database.close()

            with (
                mock.patch.object(module, "get_default_hermes_root", lambda: root),
                mock.patch.object(module, "_MAX_SESSION_IDENTITIES", 1),
                mock.patch.object(module.time, "time", return_value=1100),
            ):
                payload = module._all_profiles_history(7, 200)

        self.assertFalse(payload["available"])
        self.assertEqual(
            payload["profile_failures"],
            [{"profile": "default", "code": "session_identity_scan_truncated"}],
        )

    def test_all_profiles_merge_is_globally_bounded_and_deterministic(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            alpha = root / "profiles" / "alpha"
            alpha.mkdir(parents=True)
            self._create_state_db(root)
            self._create_state_db(alpha)
            for profile, home in (("default", root), ("alpha", alpha)):
                database = sqlite3.connect(home / "state.db")
                database.executemany(
                    """INSERT INTO sessions VALUES (
                        ?, 'cli', 'gpt-test', 'openai-codex', 1000, 1010,
                        1, 0, 0, 0, 0, 1, NULL, 0.0, 'estimated'
                    )""",
                    [(f"{profile}_{index:04d}_session_12345678",) for index in range(150)],
                )
                database.commit()
                database.close()

            with (
                mock.patch.object(module, "get_default_hermes_root", lambda: root),
                mock.patch.object(module.time, "time", return_value=1100),
            ):
                payload = module._all_profiles_history(7, 200)

        self.assertEqual(payload["row_count"], 300)
        self.assertEqual(len(payload["rows"]), 200)
        self.assertTrue(payload["rows_truncated"])
        self.assertEqual([row["profile"] for row in payload["rows"][:150]], ["alpha"] * 150)
        self.assertEqual([row["profile"] for row in payload["rows"][150:]], ["default"] * 50)


class RouteTests(unittest.TestCase):
    def test_routes_and_query_validation(self):
        app = FastAPI()
        app.include_router(module.router, prefix="/api/plugins/ai-usage-monitor")
        client = TestClient(app)

        self.assertEqual(client.get("/api/plugins/ai-usage-monitor/health").status_code, 200)
        self.assertEqual(
            client.get("/api/plugins/ai-usage-monitor/history?days=0&limit=30").status_code,
            422,
        )
        self.assertEqual(
            client.get("/api/plugins/ai-usage-monitor/history?days=7&limit=201").status_code,
            422,
        )
        self.assertEqual(
            client.get("/api/plugins/ai-usage-monitor/history?days=91&limit=30").status_code,
            422,
        )
        self.assertEqual(
            client.get("/api/plugins/ai-usage-monitor/history?scope=invalid").status_code,
            422,
        )
        self.assertEqual(
            client.get(
                "/api/plugins/ai-usage-monitor/history?days=1&limit=30&bucket_start=1"
            ).status_code,
            422,
        )

    def test_success_paths_through_mounted_router(self):
        with tempfile.TemporaryDirectory() as tmp:
            home = Path(tmp)
            HistoryTests._create_state_db(home)
            database = sqlite3.connect(home / "state.db")
            database.execute(
                """INSERT INTO sessions VALUES (
                    '20260724_120000_route12345678', 'desktop', 'gpt-test', 'openai-codex',
                    strftime('%s','now'), strftime('%s','now'),
                    10, 5, 0, 0, 1, 1, NULL, 0.0, 'estimated'
                )"""
            )
            database.commit()
            database.close()

            app = FastAPI()
            app.include_router(module.router, prefix="/api/plugins/ai-usage-monitor")
            module._account_cache.clear()
            with (
                mock.patch.object(module, "get_hermes_home", lambda: home),
                mock.patch.object(module, "get_default_hermes_root", lambda: home),
                mock.patch.object(module, "fetch_account_usage", lambda _provider: FakeSnapshot()),
            ):
                client = TestClient(app)
                snapshot_response = client.get(
                    "/api/plugins/ai-usage-monitor/snapshot?provider=openai-codex"
                )
                history_response = client.get(
                    "/api/plugins/ai-usage-monitor/history?days=7&limit=30"
                )

        self.assertEqual(snapshot_response.status_code, 200)
        self.assertTrue(snapshot_response.json()["account"]["available"])
        self.assertEqual(history_response.status_code, 200)
        self.assertTrue(history_response.json()["history"]["available"])
        self.assertEqual(history_response.json()["history"]["profile_scope"], "current")
        self.assertEqual(history_response.json()["history"]["profiles"][0]["profile"], "default")
        self.assertEqual(history_response.json()["history"]["rows"][0]["model"], "gpt-test")
        self.assertEqual(
            history_response.json()["history"]["rows"][0]["session_ref"],
            "oute12345678",
        )
        self.assertGreaterEqual(len(history_response.json()["history"]["series"]["points"]), 7)
        module._account_cache.clear()


if __name__ == "__main__":
    unittest.main()
