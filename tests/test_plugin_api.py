from __future__ import annotations

import importlib.util
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
                    's1', 'desktop', 'gpt-test', 'openai-codex',
                    strftime('%s','now'), strftime('%s','now'),
                    100, 20, 300, 5, 10, 4, NULL, 0.12, 'estimated'
                )"""
            )
            db.execute(
                """INSERT INTO sessions VALUES (
                    's2', 'desktop', 'gpt-test', 'openai-codex',
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
        self.assertNotIn("id", payload["rows"][0])
        self.assertNotIn("cost_usd", payload["rows"][0])
        self.assertNotIn("content", payload["rows"][0])
        self.assertNotIn("prompt", payload["rows"][0])

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

    def test_success_paths_through_mounted_router(self):
        with tempfile.TemporaryDirectory() as tmp:
            home = Path(tmp)
            HistoryTests._create_state_db(home)
            database = sqlite3.connect(home / "state.db")
            database.execute(
                """INSERT INTO sessions VALUES (
                    'route-test', 'desktop', 'gpt-test', 'openai-codex',
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
        module._account_cache.clear()


if __name__ == "__main__":
    unittest.main()
