# Privacy Model

## Data read

From Hermes provider adapters:

- provider identifier and source;
- plan label, if supplied;
- quota window label, utilization, remaining percentage, reset time, and bounded detail;
- fetch timestamp and bounded account-usage details.

From the active Hermes profile's `sessions` table:

- surface/source;
- model and billing provider;
- start/end timestamps;
- input, output, cache-read, cache-write, and reasoning counters;
- API-call count;
- the session identifier only transiently, to derive a bounded log-searchable suffix.

## Data deliberately not read or returned

- prompts, messages, transcripts, tool arguments, or tool results;
- provider API keys, OAuth tokens, cookies, or auth headers;
- complete internal session identifiers;
- local filesystem paths or raw database/provider exceptions;
- configuration values other than the active provider identifier;
- cost fields that are not displayed by the current product.

## Session references

The API returns only the final 12 characters of a session identifier as `session_ref`.
The suffix is extended to 16 or 20 characters when needed to avoid a collision across
the complete sessions table. A reference is omitted if it would equal the complete
identifier or leave fewer than four characters hidden. The complete identifier is
removed before serialization. This reference is
operational metadata, not anonymisation: authorised users can search it in retained
Hermes logs, so shared Dashboard access must remain restricted.

## Storage and retention

The plugin creates no database and writes no browser storage. It reads existing Hermes
usage records according to the retention policy of Hermes itself. Account snapshots are
held in process memory for 45 seconds and scoped to the active Hermes home/profile.
History periods are limited to 90 days and session lists to 200 rows per request.
Selecting a chart bucket performs a bounded server query and reports `row_count` plus
`rows_truncated` when additional matching sessions exist.

## Network behavior

The browser and Desktop surfaces call only same-origin Hermes plugin endpoints through
host SDK clients. Provider quota retrieval is delegated to Hermes core adapters. The
plugin contains no analytics, telemetry export, remote fonts, third-party scripts, or
arbitrary outbound URL feature.

## Shared deployments

Usage metadata can reveal models, activity timing, and interaction surfaces. Treat the
Dashboard as sensitive operational tooling, enforce Hermes authentication, restrict
network exposure, and provide access only to users authorised for the active profile.
