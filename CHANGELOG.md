# Changelog

All notable changes follow [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/masterlf/hermes-ai-usage/compare/v0.2.1...HEAD
[0.2.1]: https://github.com/masterlf/hermes-ai-usage/releases/tag/v0.2.1
