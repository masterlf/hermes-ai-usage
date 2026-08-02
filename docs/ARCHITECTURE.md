# Architecture

## Components

### Hermes core adapters

`agent.account_usage.fetch_account_usage(provider)` owns provider authentication and
remote quota retrieval. The plugin passes only an allowlisted provider identifier and
receives an `AccountUsageSnapshot`. Credentials never enter plugin state or responses.

### Read-only backend

`runtime/dashboard/plugin_api.py` exports a FastAPI `APIRouter`. Hermes mounts it at
`/api/plugins/ai-usage-monitor/` behind the Dashboard's authentication middleware.

The backend:

- resolves the active provider from profile-aware Hermes configuration;
- caches quota snapshots for 45 seconds using `(Hermes home, provider)` as the key;
- serializes a bounded allowlist of quota fields;
- opens the active profile's `state.db` using SQLite URI `mode=ro`;
- enforces `PRAGMA query_only=ON`;
- selects only usage metadata and counters from `sessions`;
- aggregates bounded hourly/daily token series in UTC and fills explicit zero-usage buckets;
- uses session completion time (`ended_at`, falling back to `started_at`) consistently
  for totals, chart buckets, and bucket-specific session queries;
- serves bounded bucket-specific rows with explicit count/truncation metadata;
- detects optional session columns by name and derives only exact allowlisted surface and
  workload enums, a strict ASCII profile slug, and validated duration/active state;
- never selects session titles, paths, prompts, chat identifiers, or raw lineage values;
- derives a collision-aware session suffix and removes the complete identifier before
  serialization;
- returns generic failures while logging only exception classes.

### Hermes Web Dashboard

`runtime/dashboard/dist/index.js` is an IIFE loaded by the host Dashboard. It uses
`window.__HERMES_PLUGIN_SDK__.fetchJSON`, which preserves host authentication and
profile scope. React elements render all provider/database strings as text. The bundle
does not import third-party code or access cookies/storage.
Its chart measures the local viewport with `ResizeObserver`, fills available width, retains
all UTC buckets, and introduces horizontal scrolling only at a 10-pixel bucket step.

### Hermes Desktop

`desktop/plugin.js` is a native ESM Desktop plugin. It uses `@hermes/plugin-sdk`,
the host request client, and the shared backend namespace. It registers a page,
sidebar entry, status-bar indicator, and command-palette action.

## Data flow

```text
Provider account API
        ^
        | Hermes credential resolver + account_usage adapter
        v
plugin_api.py ---- bounded quota JSON ----> Desktop / Web Dashboard
        |
        | read-only, parameterized SQL
        v
Hermes state.db ---- usage metadata JSON --> Desktop / Web Dashboard
```

## Trust boundaries

1. Provider responses are remote and treated as untrusted display data: strings are
   bounded and rendered as text.
2. Dashboard query parameters are attacker-controlled: FastAPI bounds type, length,
   period, and row limit.
3. Hermes `state.db` is trusted local state but may contain user-influenced labels;
   returned strings are bounded and React-escaped.
4. Hermes authentication/profile middleware is an upstream control. Running the router
   as a standalone unauthenticated API is unsupported.
