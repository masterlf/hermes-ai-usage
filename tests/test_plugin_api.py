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
        self.assertEqual(history_response.json()["history"]["rows"][0]["model"], "gpt-test")
        self.assertEqual(
            history_response.json()["history"]["rows"][0]["session_ref"],
            "oute12345678",
        )
        self.assertGreaterEqual(len(history_response.json()["history"]["series"]["points"]), 7)
        module._account_cache.clear()


if __name__ == "__main__":
    unittest.main()
