# Installation and Operations

## Tested baseline

This release was tested on 2026-08-25 with Hermes Agent v0.20.5, upstream Hermes
commit `1bbb6e5b`, and local Hermes commit
`981101239a064c020a9d18fc3b1060ae306934ed`. This is a tested baseline, not a
claimed minimum supported version.

This repository is not packaged for native `hermes plugins install`. The release includes a
stdlib-only installer that replaces the Dashboard and Desktop plugin trees exactly and
transactionally. Configuration remains a separate operator-owned step.

## Select the canonical profile home

Discover the exact home instead of inferring it from a display name or alias:

```bash
hermes profile list
hermes profile show PROFILE_NAME
export HERMES_HOME="/exact/Path/from-profile-show"
test -f "$HERMES_HOME/config.yaml"
```

`--hermes-home` is required. The installer rejects relative, non-canonical, or symlinked
profile homes and rejects symlinked destination/ancestor components below that home.

## Verify and extract the exact release

Download the `v0.7.3` archive and `SHA256SUMS` into a new operator-selected directory:

```bash
set -eu
VERSION=v0.7.3
WORKDIR="$(mktemp -d)"
cd "$WORKDIR"
gh release download "$VERSION" --repo masterlf/hermes-ai-usage \
  --pattern "hermes-ai-usage-$VERSION.tar.gz" --pattern SHA256SUMS
gh attestation verify "hermes-ai-usage-$VERSION.tar.gz" \
  --repo masterlf/hermes-ai-usage \
  --signer-workflow masterlf/hermes-ai-usage/.github/workflows/release.yml
sha256sum --check SHA256SUMS
tar --extract --gzip --no-same-owner --no-same-permissions \
  --file "hermes-ai-usage-$VERSION.tar.gz"
cd "hermes-ai-usage-$VERSION"
```

The builder permits only fixed, relative regular-file archive members. `--no-same-owner` and
`--no-same-permissions` prevent archive metadata from selecting local ownership or extraction
modes. Byte-for-byte reproducibility is asserted only when both builds use an identical Python
runtime and compression toolchain; `SHA256SUMS` remains the release identity.

## Install or upgrade

Stop the affected Hermes backend, Dashboard, gateway, and Desktop processes. Select a unique,
safe backup identifier, then run the checked-in installer from the extracted release root:

```bash
BACKUP_ID="pre-v0.7.3"
python3 scripts/install_release.py \
  --hermes-home "$HERMES_HOME" \
  --backup-id "$BACKUP_ID"
```

The installer stages each exact tree on its destination filesystem, gives directories mode
`0755` and files mode `0644`, and atomically swaps the two components. Existing trees become
distinct sibling backups named for Dashboard and Desktop. If either swap fails, both
components return to their pre-install state. Exact-tree replacement removes stale plugin
files while preserving unrelated files such as `config.yaml`.

Add `ai-usage-monitor` to the existing `plugins.enabled` list while preserving every existing
entry, then run `hermes config check`. Dashboard-only companions may not be recognised by
`hermes plugins enable`; that does not justify replacing the list. Restart the stopped
processes only after configuration validation succeeds.

## Verify

1. Confirm `hermes config check` succeeds.
2. Open `/ai-usage` in the authenticated Dashboard and AI Usage in Desktop.
3. Confirm `/api/plugins/ai-usage-monitor/health` returns `ok: true` through the authenticated
   Dashboard session.
4. Confirm unsupported quota providers, malformed responses, and unavailable history render
   as unavailable, never as zero.
5. Confirm `state.db` remains unchanged using the deployment's backup/integrity process.

## Roll back

Stop the affected processes. Restore both exact pre-install trees transactionally:

```bash
python3 scripts/install_release.py \
  --hermes-home "$HERMES_HOME" \
  --backup-id "$BACKUP_ID" \
  --rollback
```

A single component can be restored independently with `--component dashboard` or
`--component desktop`. Use only the backup identifier created for the same canonical profile
home. Restore any separately managed `config.yaml` change separately, run
`hermes config check`, verify the restored UI/API, and restart.

## Remove

Remove `ai-usage-monitor` from `plugins.enabled` while preserving other entries, delete only
`$HERMES_HOME/plugins/ai-usage-monitor/` and
`$HERMES_HOME/desktop-plugins/ai-usage-monitor/`, validate configuration, and restart. The
plugin creates no database or browser storage.
