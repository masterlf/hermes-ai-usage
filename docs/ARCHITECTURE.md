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
- caches quota snapshots for 45 seconds using `(Hermes home, provider)` as the key and
  coalesces concurrent misses with per-key single-flight;
- serializes a bounded allowlist of quota fields and windows, rejecting non-finite or
  malformed snapshots as unavailable;
- preserves active-profile reads by default and adds an explicit `scope=all` aggregation;
- discovers only the canonical default home and direct strict-slug named profile homes,
  rejecting symlinked/non-regular databases, canonical path escapes, and duplicate physical
  databases identified by device/inode before any query;
- bounds raw profile-directory enumeration before sorting or filtering and reports
  truncation through fixed failure metadata;
- opens every eligible `state.db` independently using SQLite URI `mode=ro`;
- enforces and verifies `PRAGMA query_only=ON` and a per-database VM-step budget;
- selects only usage metadata and counters from `sessions`;
- aggregates bounded hourly/daily token series in UTC and fills explicit zero-usage buckets;
- uses session completion time (`ended_at`, falling back to `started_at`) consistently
  for totals, chart buckets, and bucket-specific session queries;
- serves bounded bucket-specific rows with explicit count/truncation metadata;
- detects optional session columns by name and derives only exact allowlisted surface and
  workload enums and validated duration/active state; all-profile identity comes only from
  the validated database home, never the stored `profile_name` value;
- never selects session titles, paths, prompts, chat identifiers, or raw lineage values;
- derives globally collision-safe session suffixes across every healthy profile before
  complete identifiers are discarded, and uses profile-composite React keys;
- transiently compares a bounded set of full session IDs across databases; if an ID occurs
  in more than one physical database, every affected database is excluded and reported as
  partial because profile ownership cannot be proven;
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
default + named profile state.db -- explicit scope=all aggregate --^
```

## Trust boundaries

1. Provider responses are remote and treated as untrusted display data: strings are
   bounded and rendered as text.
2. Dashboard query parameters are attacker-controlled: FastAPI bounds type, length,
   period, and row limit.
3. Hermes `state.db` is trusted local state but may contain user-influenced labels;
   returned strings are bounded and React-escaped.
4. Explicit All-profiles access expands the read boundary to every eligible local profile;
   partial failures are sanitized and healthy data is retained without claiming complete totals.
5. Hermes authentication is an upstream control. The official Dashboard is a machine-level
   management surface for all local profiles; authenticated principals are trusted machine
   operators, not low-privilege per-profile users. Distinct exposure requires separate auth
   and `--isolated` servers. Running the router standalone is unsupported. See
   https://hermes-agent.nousresearch.com/docs/user-guide/features/web-dashboard.
