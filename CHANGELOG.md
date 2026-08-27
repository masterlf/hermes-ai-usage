# Changelog

All notable changes follow [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.7.5] - 2026-08-27

### Fixed

- Web Dashboard and Desktop history validation now accepts finite nonnegative fractional Unix
  timestamps from the backend while retaining integer-only validation for counts and buckets.

## [0.7.4] - 2026-08-26

### Changed

- The repository is now one official Hermes hybrid plugin package with canonical runtime ID
  `ai-usage-monitor`, a minimal root manifest and inert agent entry point, and co-located
  Dashboard and Desktop extensions under the installed plugin tree.
- `hermes plugins install masterlf/hermes-ai-usage` is now the primary installation path.

### Security

- The manual legacy migration stages and atomically swaps the unified package before retiring
  only the exact standalone Desktop tree, keeps distinct split-tree backups, preserves config
  and unrelated plugins, and restores the complete old state after any failed boundary.

## [0.7.3] - 2026-08-25

### Security

- Current-profile history now fails closed before SQLite open when canonical profile identity
  cannot be proven; All-profile session references are collision-safe across profiles.
- SQLite VM-step budgets cover identity/collision scans, provider snapshots reject malformed
  or non-finite data, and concurrent cache misses are coalesced per profile/provider key.
- Deterministic release archives, SHA-256 checksums, and a SHA-pinned release workflow now
  gate the exact tagged SHA on current `origin/main`, then separate unprivileged verification
  and build from privileged provenance attestation and publication.
- Provider single-flight owners now release the exact waiter event in `finally`, including
  on `BaseException`, while waiters have a bounded unavailable fallback.

### Fixed

- Desktop and Web distinguish unavailable/failed history from legitimate zero usage with a
  generic accessible alert and composite non-sensitive row keys.
- Web treats malformed successful history responses as unavailable, and Desktop keeps the
  initial loading state distinct from legitimate empty usage.
- Quota threshold labels now assign 25/50/75 boundaries unambiguously and match exact CSS
  hard stops while retaining the four-color remaining track and consumption mask.

### Documentation

- Installation now uses a checked-in safe exact-tree installer with canonical-path and
  symlink validation, per-filesystem staging, distinct backups, and transactional rollback.

## [0.7.2] - 2026-08-25

### Fixed

- Desktop and Web quota bars now expose remaining allowance on one fixed red-to-green scale,
  masking the consumed right-hand portion instead of compressing all colors into the remainder.
- A visible English/French threshold legend supplements the progress value so status does not
  depend on color alone, while forced-colors and reduced-motion behavior remain supported.

## [0.7.1] - 2026-08-25

### Fixed

- Desktop and Web now place the compact per-profile table directly between the token chart
  and recent history, retaining every profile in a keyboard-scrollable five-row viewport.
- Quota bars now fill and expose the remaining percentage, matching their adjacent headline,
  while retaining the used percentage and reset time in the footer.

### Changed

- Both surfaces visibly identify plugin version v0.7.1 in their headers.

## [0.7.0] - 2026-08-24

### Added

- v0.7.0 initially selects All profiles in Desktop and Web while preserving the selected
  scope across refresh, period changes, and bucket drill-downs.
- Neutral `non_cache_read_tokens` presentation (`input_tokens + output_tokens +
  cache_write_tokens`) now separates non-cache-read and cache-read counters throughout the
  English/French UI, with raw total retained only as labelled secondary context.

### Changed

- Per-profile and recent-session views now expose non-cache read, cache read, raw total,
  calls, and sessions explicitly; existing thresholds are labelled as raw-volume bands.

## [0.6.1] - 2026-08-24

### Fixed

- v0.6.1 shows canonical current-profile ownership or the count of consuming profiles
  directly beside the Desktop and Web token-chart title, including truthful zero-usage
  English/French states and the current-profile breakdown.

### Security

- Current-profile attribution now comes only from an exact canonical default or strict
  named-profile database path; stored profile labels, symlinks, path escapes, and invalid
  profile slugs cannot invent ownership. Provider quota remains account-level/shared.

## [0.6.0] - 2026-08-23

### Added

- v0.6.0 period-composition summaries in Desktop and Web with truthful four-category
  percentages, exact values, visible labelled swatches, and responsive English/French copy.
- Multi-color linear token timelines with reasoning hatched within output, reusable
  hover/focus breakdowns, roving keyboard navigation, and explicit selection semantics.

### Fixed

- Chart geometry now recomputes additive token totals from normalized input, output,
  cache-read, and cache-write counters, so reasoning is never double counted and stale
  `total_tokens` values cannot distort ratios or bucket heights.

## [0.5.0] - 2026-08-23

### Added

- Explicit current-profile/All-profiles controls in Desktop and Web Dashboard for
  24-hour, 7-day, 30-day, and 90-day locally recorded token attribution.
- Ranked per-profile token, API-call, and session totals plus profile labels on every
  drill-down row and truthful partial-data warnings.

### Security

- All-profile discovery is bounded to the canonical Hermes root and strict lowercase
  profile slugs, rejects symlinks and path escapes, and opens each database independently
  with SQLite read-only and query-only enforcement.
- Profile attribution comes only from the validated database home; stored profile labels,
  sensitive session content, full identifiers, paths, and raw failures are excluded.
- Provider quota remains a single account-level/shared snapshot and is never apportioned
  to profiles.
- The hashed development lock updates pip to 26.2 to clear PYSEC-2026-3721.

## [0.4.0] - 2026-08-02

### Added

- Container-aware UTC token charts that retain every returned bucket and scroll only
  below a 10-pixel minimum bucket step.
- Privacy-safe session surface, workload type, strict profile slug, duration, and active
  state, with no raw title, custom source, path, chat metadata, or complete identifiers.
- Five deterministic, localized token-consumption bands with visible text labels and
  responsive Desktop/Web session history.

### Fixed

- Quota progress now derives finite used percentage from remaining percentage when needed,
  distinguishes unavailable data from zero, and exposes accessible progress semantics.

### Security

- Raw session source is replaced by an exact allowlisted enum; the compatibility `source`
  field is now only an alias of that safe enum.
- Optional session schema fields are detected by name and fail closed to bounded null,
  `other`, or `unknown` values.

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

[Unreleased]: https://github.com/masterlf/hermes-ai-usage/compare/v0.7.5...HEAD
[0.7.5]: https://github.com/masterlf/hermes-ai-usage/compare/v0.7.4...v0.7.5
[0.7.4]: https://github.com/masterlf/hermes-ai-usage/releases/tag/v0.7.4
[0.7.3]: https://github.com/masterlf/hermes-ai-usage/releases/tag/v0.7.3
[0.7.2]: https://github.com/masterlf/hermes-ai-usage/releases/tag/v0.7.2
[0.7.1]: https://github.com/masterlf/hermes-ai-usage/releases/tag/v0.7.1
[0.7.0]: https://github.com/masterlf/hermes-ai-usage/releases/tag/v0.7.0
[0.6.1]: https://github.com/masterlf/hermes-ai-usage/releases/tag/v0.6.1
[0.6.0]: https://github.com/masterlf/hermes-ai-usage/releases/tag/v0.6.0
[0.5.0]: https://github.com/masterlf/hermes-ai-usage/releases/tag/v0.5.0
[0.4.0]: https://github.com/masterlf/hermes-ai-usage/releases/tag/v0.4.0
[0.3.0]: https://github.com/masterlf/hermes-ai-usage/releases/tag/v0.3.0
[0.2.1]: https://github.com/masterlf/hermes-ai-usage/releases/tag/v0.2.1
