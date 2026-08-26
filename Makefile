PYTHON ?= python3

.PHONY: test fuzz lint security check

test:
	$(PYTHON) -m unittest discover -s tests -v
	node --check desktop/plugin.js
	node --check dashboard/dist/index.js
	node tests/test_dashboard_bundle.cjs
	node tests/test_desktop_bundle.cjs
	node tests/test_fuzz_config.cjs
	$(MAKE) fuzz

fuzz:
	npm run fuzz --silent

lint:
	$(PYTHON) -m ruff check .
	$(PYTHON) -m bandit -c pyproject.toml -r dashboard

security:
	$(PYTHON) scripts/security_invariants.py
	$(PYTHON) -m pip_audit -r requirements-dev.txt --require-hashes
	npm audit --audit-level=high
	zizmor .github/workflows --persona=pedantic

check: test lint security
