# Security Assessment

Assessment date: 2026-08-02

## Executive summary

The reviewed 0.4 codebase has a deliberately narrow read-only design and no plugin
runtime dependencies. No credential, prompt-content, SQL-injection, DOM-XSS, or state
mutation path was identified after hardening. Automated controls cannot prove absence
of vulnerabilities; changes touching trust boundaries require human review.

Version 0.4 additionally replaces arbitrary session source display with exact enums,
derives lineage categories without serializing marker values, validates profile slugs and
durations, and tolerates older schemas with fail-closed optional-field fallbacks.

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

## Open operational controls

Hermes authentication, TLS/network exposure, security headers, OS hardening, log access,
and backups are owned by the host deployment and cannot be enforced by this plugin.
