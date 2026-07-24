# Changelog

All notable changes follow [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.0] - 2026-07-24

### Added

- Interactive zero-dependency token chart for 24-hour, 7-day, 30-day, and 90-day periods.
- Hourly/daily read-only aggregation with explicit zero-usage buckets.
- Short log-searchable session references with collision-aware length extension.
- Chart-to-session filtering in both Hermes Desktop and Web Dashboard.
- Bounded bucket-specific session lookup with explicit truncation metadata.

### Security

- Keep complete session identifiers inside the backend and expose only bounded suffixes.
- Preserve the existing prompt/message exclusion, read-only SQLite mode, and query bounds.
- Align totals, graph bars, and drill-down rows on completion-time and current-time bounds.

## [0.2.1] - 2026-07-24

### Security

- Scope account-quota cache entries to the active Hermes home/profile.
- Remove internal session identifiers and unused cost metadata from API responses.
- Bound provider-supplied display strings and suppress raw backend/SQLite errors.

## 0.2.0 - 2026-07-24

### Added

- Native Hermes Desktop page, navigation entry, status-bar indicator, and command.
- Hermes Web Dashboard tab at `/ai-usage`.
- Read-only provider-quota snapshots and seven-day token history.
- French and English UI text.

[Unreleased]: https://github.com/masterlf/hermes-ai-usage/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/masterlf/hermes-ai-usage/releases/tag/v0.3.0
[0.2.1]: https://github.com/masterlf/hermes-ai-usage/releases/tag/v0.2.1
