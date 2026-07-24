# Roadmap

## 0.3 — defensible per-turn attribution

- Correlate provider calls to Hermes turn and session identifiers internally.
- Persist usage metadata only, with configurable retention.
- Mark provider-quota deltas as `confounded` when concurrent account use prevents
  defensible attribution.
- Export sanitized JSON/CSV without prompts or tool payloads.

## Explicit non-goals

- Estimating an official subscription percentage from local token totals.
- Capturing prompts, messages, tool arguments, provider credentials, or auth headers.
- Mutating provider quota, Hermes history, or account state.
- Implementing a second authentication or credential-storage layer.
