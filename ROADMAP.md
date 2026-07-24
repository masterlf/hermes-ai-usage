# Roadmap

## Delivered in 0.3 — session-level observability

- Hourly/daily token chart with selectable 24-hour to 90-day periods.
- Session-level token breakdown and short references searchable in retained local logs.
- No prompt/message/tool content and no complete session identifier in API responses.

## 0.4 — defensible per-turn attribution

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
