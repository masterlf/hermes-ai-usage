PYTHON ?= python3

.PHONY: test lint security check

test:
	$(PYTHON) -m unittest discover -s tests -v
	node --check desktop/plugin.js
	node --check runtime/dashboard/dist/index.js
	node tests/test_dashboard_bundle.cjs
	node tests/test_desktop_bundle.cjs

lint:
	$(PYTHON) -m ruff check .
	$(PYTHON) -m bandit -c pyproject.toml -r runtime/dashboard

security:
	$(PYTHON) scripts/security_invariants.py
	$(PYTHON) -m pip_audit -r requirements-dev.txt --require-hashes
	zizmor .github/workflows --persona=pedantic

check: test lint security
