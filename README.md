# Hermes AI Usage Monitor

[![CI](https://github.com/masterlf/hermes-ai-usage/actions/workflows/ci.yml/badge.svg)](https://github.com/masterlf/hermes-ai-usage/actions/workflows/ci.yml)
[![CodeQL](https://github.com/masterlf/hermes-ai-usage/actions/workflows/codeql.yml/badge.svg)](https://github.com/masterlf/hermes-ai-usage/actions/workflows/codeql.yml)
[![Secret scan](https://github.com/masterlf/hermes-ai-usage/actions/workflows/secret-scan.yml/badge.svg)](https://github.com/masterlf/hermes-ai-usage/actions/workflows/secret-scan.yml)
[![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/masterlf/hermes-ai-usage/badge)](https://securityscorecards.dev/viewer/?uri=github.com/masterlf/hermes-ai-usage)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

A read-only extension for [Hermes Agent](https://github.com/NousResearch/hermes-agent)
that separates three facts people often blur together:

1. **Official provider quota** — only when Hermes can obtain a provider-backed snapshot.
2. **Local Hermes usage** — token and call counters recorded in Hermes `state.db`.
3. **Unavailable data** — displayed honestly instead of converted from a guessed allowance.

The plugin supports the native Hermes Desktop app and the Hermes Web Dashboard.
It never reads prompt or message content.

Current plugin version: **v0.7.3**.

Tested baseline (not a minimum-support claim): Hermes v0.20.5, upstream `1bbb6e5b`,
local `981101239a064c020a9d18fc3b1060ae306934ed`, tested 2026-08-25.

## Features

- account-quota windows, remaining percentage, and reset time for providers supported
  by Hermes core (`openai-codex`, Anthropic OAuth, and OpenRouter);
- Desktop status-bar indicator and detailed page;
- Web Dashboard tab at `/ai-usage`;
- active-session token and context counters in Hermes Desktop;
- selectable 24-hour, 7-day, 30-day, and 90-day container-aware UTC chart that retains
  every returned hourly/daily bucket and scrolls only when buckets reach their minimum width;
- selected-period token composition with exact and percentage breakdowns, a multi-color
  linear timeline, and hatched reasoning visibly nested within output rather than double counted;
- session history with provider, model, safe surface/workload enums, strict profile slug,
  validated duration/active state, calls, five visible token-consumption bands, and a short
  reference that can be searched in retained Hermes logs;
- all-profile history initially selected in Desktop and Web Dashboard, with an explicit
  Current-profile selector and per-profile totals that disclose incomplete or truncated reads;
- separate non-cache-read, cache-read, and secondary raw totals across summaries, profile
  attribution, period composition, and recent sessions;
- a compact, keyboard-scrollable per-profile table showing five data rows at a time;
- fixed-coordinate quota scales whose visible red, orange, yellow, and green portion represents
  remaining allowance, with a text legend and the used/reset details retained;
- French and English UI;
- no independent credential handling, browser storage, analytics, or third-party scripts.

## Important semantic boundary

For `openai-codex`, the percentage is the **Codex allowance attached to the
ChatGPT subscription**. It is not a universal meter for ordinary ChatGPT
conversations. Provider quota and token counters are deliberately displayed
separately: model choice, cache, reasoning, tools, images, service tier, and
rolling windows make a direct conversion misleading.

The UI uses one neutral client-side metric:
`non_cache_read_tokens = input_tokens + output_tokens + cache_write_tokens`, after each
component is normalized to a finite non-negative bound. Cache-read tokens are shown
separately. Raw total is the secondary sum of non-cache-read and cache-read tokens. These
local counters do not represent spend, billing, provider quota, or provider allocation.

## Security posture

The repository is intentionally small and adds **zero plugin runtime dependencies**:
it reuses Hermes' FastAPI, SQLite state, provider adapters, Desktop SDK, and Dashboard SDK.

Key controls:

- provider credentials remain inside Hermes adapters;
- account snapshot cache is scoped by Hermes home/profile and provider;
- per-key single-flight prevents duplicate concurrent provider snapshot fetches and uses
  bounded waiter liveness with cleanup even when an owner aborts;
- SQLite URI `mode=ro` plus `PRAGMA query_only=ON`;
- static parameterized SQL; no mutation statements;
- response allowlisting and bounded display strings;
- exact session-surface enums and fail-closed optional-schema handling; raw source, title,
  paths, chat metadata, and lineage identifiers are never returned;
- no complete session identifiers, prompt content, messages, tool payloads, or raw
  exception text; only bounded log-searchable session suffixes are returned;
- no `innerHTML`, `eval`, browser storage, custom auth headers, or direct browser `fetch`;
- CI with locked development dependencies, Ruff, Bandit, pip-audit, CodeQL,
  Gitleaks, dependency review, zizmor, and OpenSSF Scorecard;
- GitHub Actions pinned to immutable commit SHAs.

Read [SECURITY.md](SECURITY.md), [the threat model](docs/THREAT_MODEL.md), and
[the privacy model](docs/PRIVACY.md) before deploying in a shared environment.

## Repository layout

```text
desktop/plugin.js                         Native Hermes Desktop extension
runtime/dashboard/manifest.json           Web Dashboard manifest
runtime/dashboard/dist/index.js           Web Dashboard UI bundle
runtime/dashboard/dist/style.css          Theme-aware dashboard styles
runtime/dashboard/plugin_api.py           Read-only FastAPI router
tests/                                    Backend and frontend smoke tests
scripts/security_invariants.py             Privacy/security regression gate
docs/                                     Architecture, installation, privacy, threat model
```

## Installation

See [docs/INSTALLATION.md](docs/INSTALLATION.md) for complete installation,
verification, upgrade, and removal instructions.

Install only the exact `v0.7.3` release archive after verifying `SHA256SUMS` and its
repo-and-workflow-scoped GitHub provenance attestation. The archive's checked-in Python
installer requires an explicit canonical `HERMES_HOME`, atomically replaces exact Dashboard
and Desktop trees, keeps distinct component backups, and rolls both back if either swap
fails. Configuration edits remain separate. This repository is not a native
`hermes plugins install` package.

## Development

```bash
python3 -m venv .venv
. .venv/bin/activate
python -m pip install --require-hashes -r requirements-dev.txt
make check
```

The plugin's production runtime is provided by Hermes. `requirements-dev.txt`
contains only pinned CI and review tools.

## API

Hermes mounts the router under `/api/plugins/ai-usage-monitor`:

- `GET /health`
- `GET /snapshot?provider=auto`
- `GET /history?days=7&limit=200&bucket_start=<UTC epoch>&scope=current` (`days` is bounded to
  1–90; `bucket_start` is optional and must be a UTC bucket boundary within the
  requested range, with the immediately preceding bucket also accepted as clock grace)

Hermes Dashboard authentication protects these routes. The plugin does not create
another auth mechanism and should not be exposed independently. `session_ref` is a
12-character suffix (extended on collisions), not the complete session ID; it can be
searched in local Hermes logs only while the corresponding logs are retained.
Bucket-specific results remain capped at 200 rows and expose `row_count` plus
`rows_truncated` so the UI never implies that a partial list is complete.
History rows expose `surface`, `workload_type`, `profile`, `duration_seconds`, and
`is_active`. The legacy `source` field is only an alias of the safe `surface` enum.
The backend API retains `scope=current` as its request default and reads only the active
profile when scope is omitted. Desktop and Web Dashboard initially request `scope=all`, and
their selector preserves the chosen scope across period changes, bucket selection, and
refresh. Hermes documents the Dashboard as a machine-level management surface that can manage every
local profile. Accordingly, every authenticated Dashboard principal must be treated as a
trusted machine operator, and first-party Desktop/Web clients initially select All profiles.
Shared low-privilege Dashboard access is unsupported. Operators requiring distinct exposure
must use separate authentication and `--isolated` per-profile Dashboard servers. See the
[official Dashboard documentation](https://hermes-agent.nousresearch.com/docs/user-guide/features/web-dashboard)
and [official profile documentation](https://hermes-agent.nousresearch.com/docs/user-guide/profiles).
The plugin does not invent a separate per-profile ACL. All-profile responses include `partial`, `totals_complete`,
`profile_failures`, `profiles_considered`, `profiles_succeeded`, and `profiles_truncated`.
Failures contain only profile slugs and fixed codes. Duplicate physical databases are read
once. If distinct databases contain an equal full session ID, every affected database is
excluded and the response is marked partial because exact ownership cannot be proven.
Provider quota remains account-level/shared and is never apportioned to profiles.
Raw-volume bands are fixed by raw total: Low below 10k, Moderate below 50k, Elevated below
100k, High below 250k, and Extreme at 250k or above. They appear only beside the explicitly
labelled secondary raw total, and visible text accompanies color.

## Roadmap

See [ROADMAP.md](ROADMAP.md). Per-turn attribution will only be labelled exact when
provider data and concurrency permit it; otherwise it will be labelled estimated or
confounded. The project will not derive an official quota percentage from guessed
local token allowances.

## Contributing and security

- General changes: [CONTRIBUTING.md](CONTRIBUTING.md)
- Security reports: [SECURITY.md](SECURITY.md) — never use a public issue
- Support: [SUPPORT.md](SUPPORT.md)

Licensed under [Apache-2.0](LICENSE).
