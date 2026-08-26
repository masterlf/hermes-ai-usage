# Contributing

Security and privacy boundaries are product requirements, not optional style.

## Before opening a pull request

1. Create a virtual environment: `python3 -m venv .venv`.
2. Activate it and install locked tools: `python -m pip install --require-hashes -r requirements-dev.txt`.
3. Install the locked JavaScript test dependency without lifecycle scripts: `npm ci --ignore-scripts`.
4. Run `make check`.
5. Confirm the diff contains no credentials, local paths, databases, logs, prompts,
   session transcripts, generated caches, or unrelated refactors.
6. Update tests and documentation for behavior changes.

## Property-based fuzzing

`make fuzz` runs bounded `fast-check` properties against the Web and Desktop product
bundles through the same VM fixture pattern as their smoke tests. It exercises nested
and malformed history responses, valid zero histories, counter and percentage
boundaries, quota windows, row/profile/series shapes, and hostile strings. The
properties require fail-closed history rendering, bounded percentages, no raw-HTML
sink, and matching Desktop/Web semantics.

CI runs this suite on every push and pull request; exact-tag release verification runs
it again through `make check`. An actual `fast-check` counterexample prints a replayable
seed and shrink path; copy both exactly and replay with
`FUZZ_SEED=<seed> FUZZ_PATH='<path>' make fuzz`. A timeout interruption has no shrink
path to replay. Use `FUZZ_RUNS=<1..1000>` for a longer bounded local run. Invalid run,
seed, or path values fail before fuzzing starts. This improves schema robustness; it is
not complete vulnerability coverage and does not replace review, static analysis, or
dedicated security testing.

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
