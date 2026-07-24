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
- API-call count.

## Data deliberately not read or returned

- prompts, messages, transcripts, tool arguments, or tool results;
- provider API keys, OAuth tokens, cookies, or auth headers;
- internal session identifiers;
- local filesystem paths or raw database/provider exceptions;
- configuration values other than the active provider identifier;
- cost fields that are not displayed by the current product.

## Storage and retention

The plugin creates no database and writes no browser storage. It reads existing Hermes
usage records according to the retention policy of Hermes itself. Account snapshots are
held in process memory for 45 seconds and scoped to the active Hermes home/profile.

## Network behavior

The browser and Desktop surfaces call only same-origin Hermes plugin endpoints through
host SDK clients. Provider quota retrieval is delegated to Hermes core adapters. The
plugin contains no analytics, telemetry export, remote fonts, third-party scripts, or
arbitrary outbound URL feature.

## Shared deployments

Usage metadata can reveal models, activity timing, and interaction surfaces. Treat the
Dashboard as sensitive operational tooling, enforce Hermes authentication, restrict
network exposure, and provide access only to users authorised for the active profile.
