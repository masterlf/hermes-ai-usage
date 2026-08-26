# Installation and Operations

## Tested baseline

This release targets the official unified Hermes plugin layout documented and implemented by
the installed Hermes source baseline. The canonical runtime ID and install directory are both
`ai-usage-monitor`.

Tested baseline (not a minimum-support claim): Hermes v0.20.5, upstream `1bbb6e5b`,
installed/local source `981101239a064c020a9d18fc3b1060ae306934ed`, tested 2026-08-25.
On that baseline, `apps/desktop/src/contrib/runtime-loader.ts` resolves both
`$HERMES_HOME/desktop-plugins/<name>/plugin.js` and
`$HERMES_HOME/plugins/<name>/desktop/plugin.js`. Unified-root entries are inventoried opt-in
with `defaultEnabled: false`, and the installed baseline's upstream `runtime-loader.test.ts`
exercises loading and removal of the unified Desktop half. Retiring the duplicate legacy
standalone tree is therefore valid only on this baseline or on a host independently verified to
expose the same unified-root contract.

Merging or publishing v0.7.4 distributes artifacts only; neither action deploys, restarts,
upgrades, or changes any Hermes installation. Installation or migration remains a separate,
explicit operator action.

## Primary install path

Select the intended Hermes profile explicitly, resolve the release tag to its exact commit, and
use the official installer pinned to that immutable commit:

```bash
hermes profile list
hermes profile show PROFILE_NAME
export HERMES_HOME="/exact/Path/from-profile-show"
test -f "$HERMES_HOME/config.yaml"
V074_SHA="$(gh api repos/masterlf/hermes-ai-usage/commits/v0.7.4 --jq .sha)"
printf '%s\n' "$V074_SHA" | grep -Eq '^[0-9a-f]{40}$'
hermes plugins install masterlf/hermes-ai-usage --ref "$V074_SHA" --enable
test "$(git -C "$HERMES_HOME/plugins/ai-usage-monitor" rev-parse HEAD)" = "$V074_SHA"
```

Hermes reads the root `plugin.yaml` and installs the repository as
`$HERMES_HOME/plugins/ai-usage-monitor/`. The same tree contains the inert agent entry point,
Dashboard manifest/API/bundle, and Desktop extension. Do not copy `desktop/plugin.js` into
`$HERMES_HOME/desktop-plugins/`; a second copy creates duplicate Desktop inventory.

This Git clone installation is not covered by the release archive's `SHA256SUMS` or provenance
attestation. Those controls apply only to the release-archive/manual path below; the exact
resolved commit and installed-clone `HEAD` check provide the identity check for this path.

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

The archive contains only fixed relative regular-file members. `--no-same-owner` and
`--no-same-permissions` prevent archive metadata from selecting local ownership or modes.
Byte-for-byte reproducibility is asserted only when the Python and compression toolchains are
identical. `SHA256SUMS`, after provenance verification, is the release identity.

Before continuing, independently verify that the target host exposes `agentPluginsRoot` and the
unified discovery behavior described in the tested baseline above. If it does not, stop: the
migration must fail closed before retiring the legacy Desktop tree. Record the positive result
with the exact installer contract value below; supplying the value is an operator attestation,
not an automatic host probe.

Stop affected Hermes and Desktop processes, recording exactly which processes were stopped.
Use a unique safe backup identifier and the explicit canonical profile home discovered above:

```bash
BACKUP_ID="pre-v0.7.4"
python3 scripts/install_release.py \
  --hermes-home "$HERMES_HOME" \
  --backup-id "$BACKUP_ID" \
  --host-contract unified-desktop-plugin-root-v1
```

The installer validates that exact positive host-contract value before staging or changing any
tree. It never edits configuration. After it succeeds, preserve every existing
`plugins.enabled` entry while enabling the new runtime with the supported command, then validate
configuration and the plugin before restarting anything:

```bash
hermes plugins enable ai-usage-monitor
hermes config check
hermes plugins doctor ai-usage-monitor --ci
```

Only after both validation commands succeed, restart the Hermes/Desktop processes that were
previously stopped. Do not start processes that were not running before migration. Then perform
the health, UI, and inventory checks in [Verify](#verify).

The installer rejects relative/non-canonical homes, symlinked destinations or ancestors,
unexpected object types, path escapes, unsafe backup IDs, and pre-existing backup state. It
stages the exact unified package on the destination filesystem, atomically replaces
`plugins/ai-usage-monitor`, then retires only the exact legacy standalone Desktop tree.
Distinct backups preserve the old plugin and Desktop trees. Any failed swap or retirement
restores the complete split-tree state. `config.yaml` and unrelated plugins are never read or
modified.

A successful install retains one rollback record for each prior component. Existing trees are
kept as `$HERMES_HOME/plugins/.ai-usage-monitor-unified.backup-$BACKUP_ID` and
`$HERMES_HOME/desktop-plugins/.ai-usage-monitor-legacy-desktop.backup-$BACKUP_ID`; a component
that was absent is represented by the corresponding mode-0600
`.ai-usage-monitor-unified.absent-$BACKUP_ID` or
`.ai-usage-monitor-legacy_desktop.absent-$BACKUP_ID` marker in that same parent directory. These
distinct trees and absence markers make rollback deterministic. Operators may remove them only
after accepting the migration and explicitly forfeiting that rollback point; path and symlink
validation remains fail closed.

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

1. Confirm `hermes config check`, `hermes plugins doctor ai-usage-monitor --ci`, and
   `hermes plugins list` succeed and show one enabled AI Usage inventory entry.
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
