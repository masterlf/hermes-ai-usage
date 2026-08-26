# Installation and Operations

## Tested baseline

This release targets the official unified Hermes plugin layout documented and implemented by
the installed Hermes source baseline. The canonical runtime ID and install directory are both
`ai-usage-monitor`.

Merging or publishing v0.7.4 distributes artifacts only; neither action deploys, restarts,
upgrades, or changes any Hermes installation. Installation or migration remains a separate,
explicit operator action.

## Primary install path

Select the intended Hermes profile explicitly, then use the official installer:

```bash
hermes profile list
hermes profile show PROFILE_NAME
export HERMES_HOME="/exact/Path/from-profile-show"
test -f "$HERMES_HOME/config.yaml"
hermes plugins install masterlf/hermes-ai-usage
```

Hermes reads the root `plugin.yaml` and installs the repository as
`$HERMES_HOME/plugins/ai-usage-monitor/`. The same tree contains the inert agent entry point,
Dashboard manifest/API/bundle, and Desktop extension. Do not copy `desktop/plugin.js` into
`$HERMES_HOME/desktop-plugins/`; a second copy creates duplicate Desktop inventory.

Use the supported lifecycle commands for a published Git install:

```bash
hermes plugins doctor ai-usage-monitor
hermes plugins list
hermes plugins enable ai-usage-monitor
hermes plugins disable ai-usage-monitor
hermes plugins update ai-usage-monitor
hermes plugins remove ai-usage-monitor
```

An exact local pre-release commit can be cloned with a `file://` identifier for isolated
validation, but Hermes intentionally warns about local/insecure URL schemes. That warning is
not a production endorsement and must not be bypassed when a scanner returns `BLOCK`.

## Legacy split-tree migration or deterministic manual fallback

The old installation used both of these exact trees:

```text
$HERMES_HOME/plugins/ai-usage-monitor/
$HERMES_HOME/desktop-plugins/ai-usage-monitor/
```

Download the exact v0.7.4 release and verify its checksum and provenance before extraction:

```bash
set -eu
VERSION=v0.7.4
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

Stop affected Hermes and Desktop processes. Use a unique safe backup identifier and the
explicit canonical profile home discovered above:

```bash
BACKUP_ID="pre-v0.7.4"
python3 scripts/install_release.py \
  --hermes-home "$HERMES_HOME" \
  --backup-id "$BACKUP_ID"
```

The installer rejects relative/non-canonical homes, symlinked destinations or ancestors,
unexpected object types, path escapes, unsafe backup IDs, and pre-existing backup state. It
stages the exact unified package on the destination filesystem, atomically replaces
`plugins/ai-usage-monitor`, then retires only the exact legacy standalone Desktop tree.
Distinct backups preserve the old plugin and Desktop trees. Any failed swap or retirement
restores the complete split-tree state. `config.yaml` and unrelated plugins are never read or
modified.

## Roll back a manual migration

Stop affected processes and restore both old trees as one transaction:

```bash
python3 scripts/install_release.py \
  --hermes-home "$HERMES_HOME" \
  --backup-id "$BACKUP_ID" \
  --rollback
```

Rollback consumes the complete backup state created by the matching install. Partial component
rollback is deliberately unsupported because it can recreate contradictory inventories.

## Verify

1. Confirm `hermes plugins doctor ai-usage-monitor` and `hermes plugins list` succeed.
2. Open `/ai-usage` in the authenticated Dashboard and AI Usage in Desktop.
3. Confirm `/api/plugins/ai-usage-monitor/health` returns `ok: true` through the authenticated
   Dashboard session.
4. Confirm `$HERMES_HOME/desktop-plugins/ai-usage-monitor` is absent after migration.
5. Confirm unsupported quota providers, malformed responses, and unavailable history render as
   unavailable, never fabricated zero.
6. Confirm `state.db` bytes remain unchanged using the deployment's integrity process.

## Remove

Use `hermes plugins remove ai-usage-monitor`. For a manual fallback installation, delete only
`$HERMES_HOME/plugins/ai-usage-monitor/` after stopping affected processes. The plugin creates
no database or browser storage.
