# Security Policy

## Supported versions

Until the first stable release, security fixes are applied to the latest tagged
release and `main`. Older pre-1.0 versions are not supported.

## Reporting a vulnerability

**Do not open a public issue for a suspected vulnerability.**

Preferred channel: use [GitHub private vulnerability reporting](https://github.com/masterlf/hermes-ai-usage/security/advisories/new).
If that is unavailable, email **security@blueteamforge.com** with the subject
`[hermes-ai-usage security]`.

Include only what is necessary to reproduce the issue. Do not send real API
keys, session cookies, provider credentials, prompt content, or production
SQLite databases. Use synthetic data and redact identifiers.

We aim to acknowledge reports within three business days and provide an initial
triage within seven business days. Timelines for remediation depend on severity
and upstream Hermes dependencies. Coordinated disclosure is expected.

## Scope

In scope:

- credential or prompt-content disclosure;
- cross-profile or cross-session data exposure;
- ability to mutate Hermes state through this plugin;
- authentication bypass caused by the plugin;
- XSS or code execution in either plugin UI;
- SQL injection, unsafe path handling, or supply-chain compromise;
- material discrepancies that present local estimates as official provider quota.

Generally out of scope:

- vulnerabilities in Hermes Agent itself that are not introduced by this plugin;
- denial of service requiring an already-authenticated local administrator;
- social engineering, physical access, or unsupported modified deployments;
- public provider behavior that the plugin labels as unavailable or provider-supplied.

## Security design

- The backend is mounted behind Hermes Dashboard authentication; it implements no
  parallel authentication system.
- SQLite is opened with URI `mode=ro` and `PRAGMA query_only=ON`.
- SQL is static and parameters are bound.
- Only session metadata and usage counters are selected. Message and prompt tables
  are not queried.
- Provider credentials stay in Hermes account adapters and are never returned.
- Frontends use Hermes SDK request clients and React text rendering. No raw HTML,
  dynamic code execution, custom authorization headers, cookies, or browser storage.
- Account snapshots are cached per Hermes home/profile to prevent cross-profile reuse.

See [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md) for assumptions and residual risk.
