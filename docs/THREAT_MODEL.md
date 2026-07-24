# Threat Model

## Assets

- provider credentials and authentication state;
- prompt, message, tool, and transcript content;
- provider quota and billing-adjacent metadata;
- Hermes profile boundaries and local usage history;
- integrity of Hermes `state.db` and configuration;
- the browser/Desktop execution context.

## Adversaries

- unauthenticated network users reaching a misconfigured Dashboard;
- authenticated low-privilege users on a shared Dashboard;
- malicious or compromised provider responses;
- malicious session metadata stored locally;
- supply-chain attackers targeting development dependencies or GitHub Actions;
- contributors attempting to introduce data collection or unsafe code paths.

## Security objectives

1. Do not handle or expose provider credentials.
2. Do not read or expose prompt/message/tool content.
3. Do not mutate Hermes state or provider account state.
4. Do not cross Hermes profile boundaries through caches or database access.
5. Do not present local estimates as official remote quota.
6. Do not introduce browser code-execution or data-exfiltration sinks.
7. Keep build and automation permissions minimal and reproducible.

## Controls

| Threat | Primary controls |
|---|---|
| Credential exposure | Hermes account adapters; no credential parameters or response fields; error redaction |
| Prompt/transcript disclosure | Static SQL allowlist; no message-table access; security invariant and regression tests |
| State mutation | SQLite `mode=ro`; `query_only`; GET-only router; mutation test |
| Cross-profile leakage | cache key includes resolved Hermes home/profile; profile-isolation test |
| SQL injection | static SQL with bound numeric parameters; FastAPI validation |
| XSS / DOM injection | React text rendering; bounded strings; prohibited raw-HTML/eval sinks |
| Browser credential leakage | host SDK clients only; no custom Authorization/cookies/storage/direct fetch |
| Query DoS | bounded `days` and `limit`; short SQLite timeout; provider cache |
| Supply-chain compromise | no runtime dependencies; hashed dev lock; pinned Actions; Dependabot; review gates |
| Secret committed to Git | local and CI Gitleaks; GitHub secret scanning and push protection |

## Assumptions

- Hermes Dashboard authentication and profile scoping are correctly configured.
- Hermes core provider adapters protect credentials and validate their own remote calls.
- The local account running Hermes is trusted to read its own `state.db`.
- A host administrator can modify the plugin or database and is outside the plugin's
  isolation boundary.

## Residual risks

- Provider APIs can change semantics without notice; values remain labelled by source.
- Session/model/surface metadata can itself be sensitive in some organisations. Access
  should be limited to trusted Dashboard users.
- An authenticated user can issue repeated bounded history requests; host-level rate
  limiting and resource controls remain upstream concerns.
- A compromised Hermes core process has privileges beyond this plugin's controls.
- GitHub security automation reduces risk but does not replace human review.

## Explicitly unsupported

- exposing `plugin_api.py` as a standalone unauthenticated FastAPI service;
- copying real `state.db` or provider responses into issues/tests;
- editing the code to query prompt/message tables;
- converting token totals into an alleged official subscription percentage.
