# Security Assessment

Assessment date: 2026-08-25

## Executive summary

The reviewed 0.7.3 candidate has a deliberately narrow read-only design and no plugin
runtime dependencies. No credential, prompt-content, SQL-injection, DOM-XSS, or state
mutation path was identified after hardening. Automated controls cannot prove absence
of vulnerabilities; changes touching trust boundaries require human review.

Version 0.7.3 additionally fails closed before SQLite open when current-profile identity is
unprovable, makes All-profile references globally collision-safe, bounds provider snapshots,
coalesces concurrent quota fetches, and renders unavailable history distinctly from zero.

## Findings remediated before public release

### SEC-001 — Cross-profile account cache reuse (Medium)

The initial cache key used only the provider identifier. It now includes the resolved
Hermes home/profile and has a regression test proving two homes do not share entries.

### SEC-002 — Excessive session identifier exposure (Low)

The initial history response returned the internal session ID for UI keys. The field was
removed. Version 0.3 derives only a 12-character log-searchable suffix, checks collisions
across the complete sessions table, omits references that would equal the complete ID,
keeps at least four identifier characters hidden, and removes the complete identifier
before serialization.

### SEC-003 — Raw SQLite failure reflection (Low)

The initial history error included exception text, which could disclose filesystem
context. Clients now receive a generic reason and logs contain only the exception class.

### SEC-004 — Unbounded provider display strings (Low)

Provider-derived labels/details are now NFKC-normalized, stripped of control and
invisible Unicode format characters, length-bounded, and rendered through React text nodes.

### SEC-005 — Fail-open cache scope fallback (Low)

If the Hermes home/profile cannot be resolved, account usage is fetched without caching.
The plugin never pools such results under a shared fallback scope.

## Verified controls

- SQLite write attempts fail under the plugin connection.
- SQL selects usage metadata/counters only.
- provider exceptions are not reflected to clients;
- account cache is profile-scoped;
- route query bounds reject invalid periods and limits;
- session references remain unique in each response and complete IDs are absent;
- raw title/source/path/chat/lineage values are absent while safe session enums, profile,
  duration, and active state retain a stable response shape;
- frontend bundles avoid raw HTML, eval, storage, direct fetch, cookies, and custom auth;
- source and automation are covered by CI, static analysis, dependency audit, secret scan,
  CodeQL, dependency review, workflow analysis, and OpenSSF Scorecard.
- release archives are deterministic under an identical runtime, checksummed, path-safe, and
  built only after exact-tag/current-main checks and canonical security gates; privileged
  provenance/publication receives only a checksum-revalidated GitHub artifact.
- installation validates canonical containment and symlink-free destination paths, stages on
  each destination filesystem, and rolls back both exact component swaps on failure.
- provider single-flight cleanup releases waiters even on owner `BaseException`, and every
  waiter has a bounded unavailable fallback.

## Open operational controls

Hermes authentication, TLS/network exposure, security headers, OS hardening, log access,
and backups are owned by the host deployment and cannot be enforced by this plugin. Official
Hermes docs define the Dashboard as machine-level; shared low-privilege access is unsupported.
