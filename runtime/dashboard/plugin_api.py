"""Read-only account quota and Hermes token-history API.

Mounted by Hermes at /api/plugins/ai-usage-monitor/. Credentials remain inside
Hermes provider adapters; this module never returns tokens, keys, or raw prompts.
"""
from __future__ import annotations

import logging
import math
import re
import sqlite3
import threading
import time
import unicodedata
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from urllib.parse import quote

from agent.account_usage import AccountUsageSnapshot, fetch_account_usage
from fastapi import APIRouter, HTTPException, Query
from hermes_cli.config import load_config
from hermes_constants import get_hermes_home

router = APIRouter()
logger = logging.getLogger(__name__)

SUPPORTED_ACCOUNT_PROVIDERS = frozenset({"openai-codex", "anthropic", "openrouter"})
_ACCOUNT_CACHE_TTL_SECONDS = 45.0
_account_cache: dict[tuple[str, str], tuple[float, AccountUsageSnapshot | None]] = {}
_account_cache_lock = threading.Lock()
_SAFE_PROVIDER_RE = re.compile(r"^[a-z0-9][a-z0-9._-]{0,63}$")
_SAFE_PROFILE_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$")
_SAFE_SESSION_REF_RE = re.compile(r"^[A-Za-z0-9._-]{12,20}$")
_SESSION_REF_WIDTHS = (12, 16, 20)
_TOTAL_TOKEN_FIELDS = (
    "input_tokens",
    "output_tokens",
    "cache_read_tokens",
    "cache_write_tokens",
)
_TOKEN_FIELDS = (*_TOTAL_TOKEN_FIELDS, "reasoning_tokens")
_MAX_SESSION_DURATION_SECONDS = 365 * 86400
_REQUIRED_SESSION_COLUMNS = frozenset(
    {
        "id", "source", "model", "billing_provider", "started_at", "ended_at",
        "input_tokens", "output_tokens", "cache_read_tokens", "cache_write_tokens",
        "reasoning_tokens", "api_call_count",
    }
)
_SURFACE_ALIASES = {
    "cron": "cron",
    "desktop": "desktop",
    "cli": "cli",
    "tui": "tui",
    "acp": "acp",
    "gateway": "gateway",
    "telegram": "gateway",
    "discord": "gateway",
    "slack": "gateway",
    "whatsapp": "gateway",
    "signal": "gateway",
    "matrix": "gateway",
}


def _utc_now_iso() -> str:
    return datetime.now(UTC).isoformat()


def _clamp_percent(value: Any) -> float | None:
    if not isinstance(value, (int, float)) or isinstance(value, bool):
        return None
    return round(max(0.0, min(100.0, float(value))), 2)


def _safe_text(value: Any, max_length: int = 160) -> str | None:
    """Return bounded display text without control or invisible format characters."""
    if value is None:
        return None
    normalized = unicodedata.normalize("NFKC", str(value))
    text = "".join(
        " "
        if ord(character) < 32
        or ord(character) == 127
        or unicodedata.category(character) == "Cf"
        else character
        for character in normalized
    )
    text = re.sub(r"\s+", " ", text).strip()
    return text[:max_length]


def _safe_provider(value: Any) -> str:
    provider = str(value or "").strip().lower()
    return provider if _SAFE_PROVIDER_RE.fullmatch(provider) else ""


def _safe_profile(value: Any) -> str | None:
    if value is None:
        return None
    profile = unicodedata.normalize("NFKC", str(value)).strip()
    return profile if _SAFE_PROFILE_RE.fullmatch(profile) else None


def _safe_surface(value: Any) -> str:
    return _SURFACE_ALIASES.get(str(value or "").strip().lower(), "other")


def _session_timing(started_at: Any, ended_at: Any, now: float) -> tuple[int | None, bool]:
    if (
        not isinstance(started_at, (int, float))
        or isinstance(started_at, bool)
        or not math.isfinite(started_at)
        or started_at > now
    ):
        return None, False
    active = ended_at is None
    end = now if active else ended_at
    if (
        not isinstance(end, (int, float))
        or isinstance(end, bool)
        or not math.isfinite(end)
        or end < started_at
    ):
        return None, False
    duration = math.floor(end - started_at)
    if duration > _MAX_SESSION_DURATION_SECONDS:
        return None, False
    return duration, active


def _workload_type(
    surface: str,
    delegate: Any,
    branch: Any,
    continuation: Any,
    has_parent: Any,
) -> str:
    if surface == "cron":
        return "scheduled"
    if bool(delegate):
        return "subagent"
    if bool(branch):
        return "branch"
    if bool(continuation):
        return "continuation"
    if not bool(has_parent) and surface in {"desktop", "cli", "tui", "acp", "gateway"}:
        return "interactive"
    return "unknown"


def _configured_provider() -> str:
    try:
        config = load_config()
        model = config.get("model") if isinstance(config, dict) else None
        provider = model.get("provider") if isinstance(model, dict) else None
        return _safe_provider(provider)
    except Exception:
        return ""


def _resolve_provider(requested: str) -> str:
    provider = _safe_provider(requested) or "auto"
    return _configured_provider() if provider in {"", "auto"} else provider


def _fetch_account_snapshot(provider: str) -> AccountUsageSnapshot | None:
    try:
        return fetch_account_usage(provider)
    except Exception as exc:
        # Provider adapters cross a network/auth boundary. Keep failures inside
        # the normal "unavailable" contract and do not reflect exception text
        # (which could contain request metadata) back to the Desktop client.
        logger.warning("Account quota request failed for %s (%s)", provider, type(exc).__name__)
        return None


def _cached_account_snapshot(provider: str) -> AccountUsageSnapshot | None:
    try:
        scope = str(Path(get_hermes_home()).resolve())
    except (OSError, RuntimeError, TypeError, ValueError) as exc:
        logger.warning(
            "Hermes profile scope unavailable (%s); bypassing quota cache",
            type(exc).__name__,
        )
        return _fetch_account_snapshot(provider)

    now = time.monotonic()
    cache_key = (scope, provider)
    with _account_cache_lock:
        cached = _account_cache.get(cache_key)
        if cached and now - cached[0] < _ACCOUNT_CACHE_TTL_SECONDS:
            return cached[1]

    snapshot = _fetch_account_snapshot(provider)
    with _account_cache_lock:
        _account_cache[cache_key] = (now, snapshot)
    return snapshot


def _serialize_account(snapshot: AccountUsageSnapshot | None, provider: str) -> dict[str, Any]:
    if snapshot is None:
        return {
            "available": False,
            "provider": provider,
            "reason": "The provider did not expose an account-quota snapshot.",
            "windows": [],
            "details": [],
        }

    windows = []
    for window in snapshot.windows:
        used = _clamp_percent(window.used_percent)
        windows.append(
            {
                "label": _safe_text(window.label, 80) or "Quota",
                "used_percent": used,
                "remaining_percent": None if used is None else round(100.0 - used, 2),
                "reset_at": window.reset_at.isoformat() if window.reset_at else None,
                "detail": _safe_text(window.detail),
            }
        )

    details = []
    for detail in snapshot.details[:8]:
        safe_detail = _safe_text(detail)
        if safe_detail:
            details.append(safe_detail)

    return {
        "available": snapshot.available,
        "provider": _safe_provider(snapshot.provider) or provider,
        "source": _safe_text(snapshot.source, 80),
        "title": _safe_text(snapshot.title, 120),
        "plan": _safe_text(snapshot.plan, 80),
        "fetched_at": snapshot.fetched_at.isoformat(),
        "windows": windows,
        "details": details,
        "reason": _safe_text(snapshot.unavailable_reason),
    }


def _readonly_connection(db_path: Path) -> sqlite3.Connection:
    encoded = quote(str(db_path.resolve()), safe="/")
    connection = sqlite3.connect(f"file:{encoded}?mode=ro", uri=True, timeout=5.0)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA query_only=ON")
    return connection


def _session_references(
    session_ids: list[str],
    global_collisions: dict[int, set[str]] | None = None,
) -> dict[str, str]:
    """Build log-searchable suffixes without returning complete session identifiers."""
    unresolved = {session_id for session_id in session_ids if len(session_id) >= 16}
    references: dict[str, str] = {}
    for width in _SESSION_REF_WIDTHS:
        groups: dict[str, list[str]] = {}
        for session_id in unresolved:
            if width > len(session_id) - 4:
                continue
            reference = session_id[-width:]
            if (
                _SAFE_SESSION_REF_RE.fullmatch(reference)
                and reference not in (global_collisions or {}).get(width, set())
            ):
                groups.setdefault(reference, []).append(session_id)
        for reference, matches in groups.items():
            if len(matches) == 1:
                references[matches[0]] = reference
        unresolved.difference_update(references)
        if not unresolved:
            break
    return references


def _global_session_ref_collisions(
    connection: sqlite3.Connection,
    returned_session_ids: list[str],
) -> dict[int, set[str]]:
    candidates = {width: set() for width in _SESSION_REF_WIDTHS}
    for session_id in returned_session_ids:
        for width in _SESSION_REF_WIDTHS:
            if width <= len(session_id) - 4:
                reference = session_id[-width:]
                if _SAFE_SESSION_REF_RE.fullmatch(reference):
                    candidates[width].add(reference)

    if not any(candidates.values()):
        return {width: set() for width in _SESSION_REF_WIDTHS}

    counts = {width: dict.fromkeys(references, 0) for width, references in candidates.items()}
    for row in connection.execute("SELECT id FROM sessions"):
        session_id = str(row["id"] or "")
        for width, references in candidates.items():
            reference = session_id[-width:]
            if reference in references:
                counts[width][reference] += 1
    return {
        width: {reference for reference, count in references.items() if count > 1}
        for width, references in counts.items()
    }


def _history_series_shape(days: int, points: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    bucket_seconds = 3600 if days == 1 else 86400
    return {
        "bucket": "hour" if bucket_seconds == 3600 else "day",
        "bucket_seconds": bucket_seconds,
        "timezone": "UTC",
        "points": points or [],
    }


def _nonnegative_int(value: Any) -> int:
    try:
        return max(0, int(value or 0))
    except (TypeError, ValueError, OverflowError):
        return 0


def _normalise_token_counts(record: dict[str, Any]) -> dict[str, Any]:
    for key in _TOKEN_FIELDS:
        record[key] = _nonnegative_int(record.get(key))
    record["reasoning_tokens"] = min(record["reasoning_tokens"], record["output_tokens"])
    record["total_tokens"] = sum(record[key] for key in _TOTAL_TOKEN_FIELDS)
    return record


def _history_rows_query(columns: set[str]) -> str:
    profile = (
        "s.profile_name AS profile_raw"
        if "profile_name" in columns
        else "NULL AS profile_raw"
    )
    has_parent = (
        "CASE WHEN s.parent_session_id IS NULL THEN 0 ELSE 1 END AS has_parent"
        if "parent_session_id" in columns
        else "0 AS has_parent"
    )
    if "model_config" in columns:
        delegate = """CASE WHEN json_valid(s.model_config)
            AND json_type(s.model_config, '$._delegate_from') NOT IN ('null')
            THEN 1 ELSE 0 END AS is_delegate"""
        branch = """CASE WHEN json_valid(s.model_config)
            AND json_type(s.model_config, '$._branched_from') NOT IN ('null')
            THEN 1 ELSE 0 END AS is_branch"""
    else:
        delegate = "0 AS is_delegate"
        branch = "0 AS is_branch"
    can_join_parent = {"parent_session_id", "end_reason"}.issubset(columns)
    continuation = (
        "CASE WHEN parent.end_reason = 'compression' THEN 1 ELSE 0 END AS is_continuation"
        if can_join_parent
        else "0 AS is_continuation"
    )
    parent_join = (
        "LEFT JOIN sessions AS parent ON parent.id = s.parent_session_id"
        if can_join_parent
        else ""
    )
    # Every interpolated fragment above is selected from source-code constants only;
    # database values and request values remain bound parameters.
    query = """
        SELECT
            s.id,
            s.source AS source_raw,
            s.model,
            s.billing_provider,
            s.started_at,
            s.ended_at,
            COALESCE(s.input_tokens, 0) AS input_tokens,
            COALESCE(s.output_tokens, 0) AS output_tokens,
            COALESCE(s.cache_read_tokens, 0) AS cache_read_tokens,
            COALESCE(s.cache_write_tokens, 0) AS cache_write_tokens,
            COALESCE(s.reasoning_tokens, 0) AS reasoning_tokens,
            COALESCE(s.api_call_count, 0) AS api_call_count,
            __PROFILE__,
            __HAS_PARENT__,
            __DELEGATE__,
            __BRANCH__,
            __CONTINUATION__
        FROM sessions AS s
        __PARENT_JOIN__
        WHERE COALESCE(s.ended_at, s.started_at) >= ?
          AND COALESCE(s.ended_at, s.started_at) <= ?
          AND (
              MAX(COALESCE(s.input_tokens, 0), 0) + MAX(COALESCE(s.output_tokens, 0), 0)
              + MAX(COALESCE(s.cache_read_tokens, 0), 0)
              + MAX(COALESCE(s.cache_write_tokens, 0), 0)
          ) > 0
          AND (
              ? IS NULL OR (
                  COALESCE(s.ended_at, s.started_at) >= ?
                  AND COALESCE(s.ended_at, s.started_at) < ?
              )
          )
        ORDER BY COALESCE(s.ended_at, s.started_at) DESC
        LIMIT ?
    """
    return (
        query.replace("__PROFILE__", profile)
        .replace("__HAS_PARENT__", has_parent)
        .replace("__DELEGATE__", delegate)
        .replace("__BRANCH__", branch)
        .replace("__CONTINUATION__", continuation)
        .replace("__PARENT_JOIN__", parent_join)
    )


def _token_history(days: int, limit: int, bucket_start: int | None = None) -> dict[str, Any]:
    db_path = Path(get_hermes_home()) / "state.db"
    now = time.time()
    cutoff = now - (days * 86400)
    bucket_seconds = _history_series_shape(days)["bucket_seconds"]
    first_bucket = int(cutoff // bucket_seconds) * bucket_seconds
    last_bucket = int(now // bucket_seconds) * bucket_seconds
    if bucket_start is not None and (
        bucket_start % bucket_seconds != 0
        or bucket_start < first_bucket - bucket_seconds
        or bucket_start > last_bucket
    ):
        raise ValueError("invalid bucket")
    selected_end = bucket_start + bucket_seconds if bucket_start is not None else None
    if not db_path.exists():
        return {
            "available": False,
            "reason": "Hermes state.db was not found.",
            "rows": [],
            "row_count": 0,
            "rows_truncated": False,
            "selected_bucket_start": bucket_start,
            "totals": {},
            "series": _history_series_shape(days),
        }

    aggregate_query = """
        SELECT
            COUNT(*) AS sessions,
            COALESCE(SUM(MAX(COALESCE(api_call_count, 0), 0)), 0) AS api_calls,
            COALESCE(SUM(MAX(COALESCE(input_tokens, 0), 0)), 0) AS input_tokens,
            COALESCE(SUM(MAX(COALESCE(output_tokens, 0), 0)), 0) AS output_tokens,
            COALESCE(SUM(MAX(COALESCE(cache_read_tokens, 0), 0)), 0) AS cache_read_tokens,
            COALESCE(SUM(MAX(COALESCE(cache_write_tokens, 0), 0)), 0) AS cache_write_tokens,
            COALESCE(SUM(
                MIN(MAX(COALESCE(reasoning_tokens, 0), 0), MAX(COALESCE(output_tokens, 0), 0))
            ), 0) AS reasoning_tokens,
            COALESCE(SUM(
                MAX(COALESCE(input_tokens, 0), 0) + MAX(COALESCE(output_tokens, 0), 0)
                + MAX(COALESCE(cache_read_tokens, 0), 0)
                + MAX(COALESCE(cache_write_tokens, 0), 0)
            ), 0) AS total_tokens
        FROM sessions
        WHERE COALESCE(ended_at, started_at) >= ?
          AND COALESCE(ended_at, started_at) <= ?
          AND (
              MAX(COALESCE(input_tokens, 0), 0) + MAX(COALESCE(output_tokens, 0), 0)
              + MAX(COALESCE(cache_read_tokens, 0), 0)
              + MAX(COALESCE(cache_write_tokens, 0), 0)
          ) > 0
    """
    series_query = """
        SELECT
            CAST(COALESCE(ended_at, started_at) / ? AS INTEGER) * ? AS bucket_start,
            COUNT(*) AS sessions,
            COALESCE(SUM(MAX(COALESCE(api_call_count, 0), 0)), 0) AS api_calls,
            COALESCE(SUM(MAX(COALESCE(input_tokens, 0), 0)), 0) AS input_tokens,
            COALESCE(SUM(MAX(COALESCE(output_tokens, 0), 0)), 0) AS output_tokens,
            COALESCE(SUM(MAX(COALESCE(cache_read_tokens, 0), 0)), 0) AS cache_read_tokens,
            COALESCE(SUM(MAX(COALESCE(cache_write_tokens, 0), 0)), 0) AS cache_write_tokens,
            COALESCE(SUM(
                MIN(MAX(COALESCE(reasoning_tokens, 0), 0), MAX(COALESCE(output_tokens, 0), 0))
            ), 0) AS reasoning_tokens,
            COALESCE(SUM(
                MAX(COALESCE(input_tokens, 0), 0) + MAX(COALESCE(output_tokens, 0), 0)
                + MAX(COALESCE(cache_read_tokens, 0), 0)
                + MAX(COALESCE(cache_write_tokens, 0), 0)
            ), 0) AS total_tokens
        FROM sessions
        WHERE COALESCE(ended_at, started_at) >= ?
          AND COALESCE(ended_at, started_at) <= ?
          AND (
              MAX(COALESCE(input_tokens, 0), 0) + MAX(COALESCE(output_tokens, 0), 0)
              + MAX(COALESCE(cache_read_tokens, 0), 0)
              + MAX(COALESCE(cache_write_tokens, 0), 0)
          ) > 0
        GROUP BY bucket_start
        ORDER BY bucket_start
    """
    row_count_query = """
        SELECT COUNT(*)
        FROM sessions
        WHERE COALESCE(ended_at, started_at) >= ?
          AND COALESCE(ended_at, started_at) <= ?
          AND (
              MAX(COALESCE(input_tokens, 0), 0) + MAX(COALESCE(output_tokens, 0), 0)
              + MAX(COALESCE(cache_read_tokens, 0), 0)
              + MAX(COALESCE(cache_write_tokens, 0), 0)
          ) > 0
          AND (
              ? IS NULL OR (
                  COALESCE(ended_at, started_at) >= ?
                  AND COALESCE(ended_at, started_at) < ?
              )
          )
    """

    connection: sqlite3.Connection | None = None
    try:
        connection = _readonly_connection(db_path)
        columns = {str(row["name"]) for row in connection.execute("PRAGMA table_info(sessions)")}
        if not _REQUIRED_SESSION_COLUMNS.issubset(columns):
            raise sqlite3.OperationalError("unsupported sessions schema")
        query = _history_rows_query(columns)
        raw_rows = [
            dict(row)
            for row in connection.execute(
                query,
                (cutoff, now, bucket_start, bucket_start, selected_end, limit),
            ).fetchall()
        ]
        aggregate = dict(connection.execute(aggregate_query, (cutoff, now)).fetchone())
        row_count = _nonnegative_int(
            connection.execute(
                row_count_query,
                (cutoff, now, bucket_start, bucket_start, selected_end),
            ).fetchone()[0]
        )
        raw_points = [
            dict(row)
            for row in connection.execute(
                series_query,
                (bucket_seconds, bucket_seconds, cutoff, now),
            ).fetchall()
        ]
        returned_session_ids = [str(row.get("id") or "") for row in raw_rows]
        global_collisions = _global_session_ref_collisions(connection, returned_session_ids)
    except (sqlite3.Error, OSError) as exc:
        logger.warning("Token history query failed (%s)", type(exc).__name__)
        return {
            "available": False,
            "reason": "Hermes token history could not be read.",
            "rows": [],
            "row_count": 0,
            "rows_truncated": False,
            "selected_bucket_start": bucket_start,
            "totals": {},
            "series": _history_series_shape(days),
        }
    finally:
        if connection is not None:
            connection.close()

    totals: dict[str, Any] = _normalise_token_counts(
        {
            key: _nonnegative_int(aggregate.get(key))
            for key in ("sessions", "api_calls", *_TOKEN_FIELDS)
        }
    )
    points_by_start = {
        _nonnegative_int(point.get("bucket_start")): _normalise_token_counts(
            {
                key: _nonnegative_int(point.get(key))
                for key in ("sessions", "api_calls", *_TOKEN_FIELDS)
            }
        )
        for point in raw_points
    }
    points = []
    for point_start in range(first_bucket, last_bucket + bucket_seconds, bucket_seconds):
        point = points_by_start.get(point_start, {})
        points.append(
            {
                "bucket_start": point_start,
                **{
                    key: _nonnegative_int(point.get(key))
                    for key in (
                        "sessions",
                        "api_calls",
                        "input_tokens",
                        "output_tokens",
                        "cache_read_tokens",
                        "cache_write_tokens",
                        "reasoning_tokens",
                        "total_tokens",
                    )
                },
            }
        )
    references = _session_references(
        returned_session_ids,
        global_collisions,
    )
    rows = []
    for row in raw_rows:
        session_id = str(row.pop("id", "") or "")
        provider = _safe_provider(row.pop("billing_provider", None)) or "unknown"
        surface = _safe_surface(row.pop("source_raw", None))
        profile = _safe_profile(row.pop("profile_raw", None))
        workload_type = _workload_type(
            surface,
            row.pop("is_delegate", 0),
            row.pop("is_branch", 0),
            row.pop("is_continuation", 0),
            row.pop("has_parent", 0),
        )
        duration_seconds, is_active = _session_timing(
            row.get("started_at"), row.get("ended_at"), now
        )
        row["api_call_count"] = _nonnegative_int(row.get("api_call_count"))
        _normalise_token_counts(row)
        item = {
            **row,
            "surface": surface,
            "source": surface,
            "workload_type": workload_type,
            "profile": profile,
            "duration_seconds": duration_seconds,
            "is_active": is_active,
            "model": _safe_text(row.get("model"), 160) or "unknown",
            "provider": provider,
            "session_ref": references.get(session_id),
        }
        rows.append(item)
    return {
        "available": True,
        "days": days,
        "rows": rows,
        "row_count": row_count,
        "rows_truncated": row_count > len(rows),
        "selected_bucket_start": bucket_start,
        "totals": totals,
        "series": _history_series_shape(days, points),
    }


@router.get("/health")
def health() -> dict[str, Any]:
    return {"ok": True, "plugin": "ai-usage-monitor", "time": _utc_now_iso()}


@router.get("/snapshot")
def snapshot(provider: str = Query(default="auto", max_length=64)) -> dict[str, Any]:
    resolved = _resolve_provider(provider)
    if resolved not in SUPPORTED_ACCOUNT_PROVIDERS:
        return {
            "ok": True,
            "account": {
                "available": False,
                "provider": resolved or "unknown",
                "reason": (
                    "Account quota is currently available only for openai-codex, "
                    "Anthropic OAuth, and OpenRouter. Token accounting remains "
                    "available for all providers."
                ),
                "windows": [],
                "details": [],
            },
        }
    return {"ok": True, "account": _serialize_account(_cached_account_snapshot(resolved), resolved)}


@router.get("/history")
def history(
    days: int = Query(default=7, ge=1, le=90),
    limit: int = Query(default=30, ge=1, le=200),
    bucket_start: int | None = Query(default=None, ge=0),
) -> dict[str, Any]:
    try:
        payload = _token_history(days, limit, bucket_start)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="invalid history bucket") from exc
    return {"ok": True, "history": payload}
