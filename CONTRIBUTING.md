# Contributing

Security and privacy boundaries are product requirements, not optional style.

## Before opening a pull request

1. Create a virtual environment: `python3 -m venv .venv`.
2. Activate it and install locked tools: `python -m pip install --require-hashes -r requirements-dev.txt`.
3. Run `make check`.
4. Confirm the diff contains no credentials, local paths, databases, logs, prompts,
   session transcripts, generated caches, or unrelated refactors.
5. Update tests and documentation for behavior changes.

## Pull-request expectations

- Keep changes focused and explain the threat-model impact.
- Add a regression test for security or correctness fixes.
- Do not weaken read-only database access, response allowlists, query bounds,
  profile scoping, or error redaction.
- Do not add runtime dependencies without a documented necessity and supply-chain review.
- Never add telemetry, external analytics, or outbound calls outside Hermes provider adapters.
- Use normal React element rendering; raw HTML sinks are prohibited.
- All required GitHub checks must pass. Maintainers may request independent review
  for changes affecting credentials, authentication, database queries, or release workflows.

## Reporting vulnerabilities

Follow [SECURITY.md](SECURITY.md). Never include vulnerability details in a public issue.

## License

By contributing, you agree that your contributions are licensed under Apache-2.0.
