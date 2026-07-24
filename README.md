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

## Features

- account-quota windows, remaining percentage, and reset time for providers supported
  by Hermes core (`openai-codex`, Anthropic OAuth, and OpenRouter);
- Desktop status-bar indicator and detailed page;
- Web Dashboard tab at `/ai-usage`;
- active-session token and context counters in Hermes Desktop;
- selectable 24-hour, 7-day, 30-day, and 90-day token chart with hourly/daily buckets;
- session history with provider, model, surface, calls, token categories, and a short
  reference that can be searched in retained Hermes logs;
- French and English UI;
- no independent credential handling, browser storage, analytics, or third-party scripts.

## Important semantic boundary

For `openai-codex`, the percentage is the **Codex allowance attached to the
ChatGPT subscription**. It is not a universal meter for ordinary ChatGPT
conversations. Provider quota and token counters are deliberately displayed
separately: model choice, cache, reasoning, tools, images, service tier, and
rolling windows make a direct conversion misleading.

## Security posture

The repository is intentionally small and adds **zero plugin runtime dependencies**:
it reuses Hermes' FastAPI, SQLite state, provider adapters, Desktop SDK, and Dashboard SDK.

Key controls:

- provider credentials remain inside Hermes adapters;
- account snapshot cache is scoped by Hermes home/profile and provider;
- SQLite URI `mode=ro` plus `PRAGMA query_only=ON`;
- static parameterized SQL; no mutation statements;
- response allowlisting and bounded display strings;
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

Short version:

```bash
git clone https://github.com/masterlf/hermes-ai-usage.git
cd hermes-ai-usage
install -d ~/.hermes/plugins/ai-usage-monitor/dashboard/dist
install -d ~/.hermes/desktop-plugins/ai-usage-monitor
install -m 0644 runtime/dashboard/plugin_api.py ~/.hermes/plugins/ai-usage-monitor/dashboard/
install -m 0644 runtime/dashboard/manifest.json ~/.hermes/plugins/ai-usage-monitor/dashboard/
install -m 0644 runtime/dashboard/dist/index.js ~/.hermes/plugins/ai-usage-monitor/dashboard/dist/
install -m 0644 runtime/dashboard/dist/style.css ~/.hermes/plugins/ai-usage-monitor/dashboard/dist/
install -m 0644 desktop/plugin.js ~/.hermes/desktop-plugins/ai-usage-monitor/
```

Preserve existing configuration and add `ai-usage-monitor` to `plugins.enabled`
in `~/.hermes/config.yaml`, then run `hermes config check`. Restart the Hermes
backend and Dashboard from an external shell. Do not replace the existing enabled
plugin list with a single value.

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
- `GET /history?days=7&limit=200&bucket_start=<UTC epoch>` (`days` is bounded to
  1–90; `bucket_start` is optional and must match a returned UTC bucket)

Hermes Dashboard authentication protects these routes. The plugin does not create
another auth mechanism and should not be exposed independently. `session_ref` is a
12-character suffix (extended on collisions), not the complete session ID; it can be
searched in local Hermes logs only while the corresponding logs are retained.
Bucket-specific results remain capped at 200 rows and expose `row_count` plus
`rows_truncated` so the UI never implies that a partial list is complete.

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
