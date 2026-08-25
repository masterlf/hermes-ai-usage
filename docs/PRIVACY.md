# Privacy Model

## Data read

From Hermes provider adapters:

- provider identifier and source;
- plan label, if supplied;
- quota window label, utilization, remaining percentage, reset time, and bounded detail;
- fetch timestamp and bounded account-usage details.

From the active Hermes profile's `sessions` table for the API's default current scope, or from
the canonical default and validated named profile databases for `scope=all`. The first-party
Desktop and Web clients initially request All profiles because Dashboard principals are
trusted machine operators:

- raw source transiently, only to map it to an exact allowlisted `surface` enum;
- lineage marker presence as booleans, only to derive a bounded `workload_type` enum;
- database-home profile identity for All-profiles attribution (`default` or a validated slug);
- model and billing provider;
- start/end timestamps;
- input, output, cache-read, cache-write, and reasoning counters;
- API-call count;
- the session identifier only transiently, to derive a bounded log-searchable suffix.
- validated duration and active state derived from bounded timestamps.

## Data deliberately not read or returned

- prompts, messages, transcripts, tool arguments, or tool results;
- provider API keys, OAuth tokens, cookies, or auth headers;
- complete internal session identifiers;
- local filesystem paths or raw database/provider exceptions;
- session titles, arbitrary/custom source labels, cron names/prompts, subagent goals,
  parent/lineage identifiers, profile fallbacks, chat/user/thread identifiers, or origin JSON;
- configuration values other than the active provider identifier;
- cost fields that are not displayed by the current product.

## Session references

The API returns only the final 12 characters of a session identifier as `session_ref`.
The suffix is extended to 16 or 20 characters when needed to avoid a collision across
every healthy database included in an All-profiles response. A reference is omitted if it would equal the complete
identifier or leave fewer than four characters hidden. The complete identifier is
removed before serialization. This reference is
operational metadata, not anonymisation: authorised users can search it in retained
Hermes logs, so shared Dashboard access must remain restricted.

## Storage and retention

The plugin creates no database and writes no browser storage. It reads existing Hermes
usage records according to the retention policy of Hermes itself. Account snapshots are
held in process memory for 45 seconds and scoped to the active Hermes home/profile.
History periods are limited to 90 days, eligible profiles to 64, provider windows/details
to eight each, and the combined session
list to 200 rows per request. Raw profile-directory enumeration and the transient per-profile
session-identity integrity scan have fixed ceilings. Each database query has a fixed SQLite
VM-step budget. Duplicate physical databases are queried once. Distinct databases sharing a
full session ID are all excluded from the aggregate and reported as partial; the full ID is
never returned or logged.
Selecting a chart bucket performs a bounded server query and reports `row_count` plus
`rows_truncated` when additional matching sessions exist.

## Network behavior

The browser and Desktop surfaces call only same-origin Hermes plugin endpoints through
host SDK clients. Provider quota retrieval is delegated to Hermes core adapters. The
plugin contains no analytics, telemetry export, remote fonts, third-party scripts, or
arbitrary outbound URL feature.

## Shared deployments

Usage metadata can reveal models, activity timing, and interaction surfaces. Official Hermes
documentation defines the Dashboard as a machine-level management surface for every local
profile. Treat every authenticated principal as a trusted machine operator; shared
low-privilege Dashboard access is unsupported. Use separate authentication and `--isolated`
servers when operators require distinct exposure. See
https://hermes-agent.nousresearch.com/docs/user-guide/features/web-dashboard.
Safe enums, profile names, timestamps, token volume, and suffix references remain
correlatable operational metadata; they are minimised, not anonymised.
