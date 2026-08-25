# Installation and Operations

## Tested baseline

This release was tested on 2026-08-25 with Hermes Agent v0.20.5, upstream Hermes
commit `1bbb6e5b`, and local Hermes commit
`981101239a064c020a9d18fc3b1060ae306934ed`. This is a tested baseline, not a
claimed minimum supported version.

This repository is not packaged for native `hermes plugins install`. Installation is a
reviewable file copy into one Hermes profile home. Set `HERMES_HOME` explicitly for a
named profile; otherwise the default is `$HOME/.hermes`.

## Verified install from an exact release

Download the `v0.7.3` archive and `SHA256SUMS` from the GitHub release. The release
workflow builds the archive deterministically, publishes its SHA-256 checksum, and emits
GitHub build-provenance attestation. Verify both the checksum and, where available, the
attestation before extracting.

```bash
set -eu
VERSION=v0.7.3
HERMES_HOME="${HERMES_HOME:-$HOME/.hermes}"
WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT
cd "$WORKDIR"
gh release download "$VERSION" --repo masterlf/hermes-ai-usage \
  --pattern "hermes-ai-usage-$VERSION.tar.gz" --pattern SHA256SUMS
gh attestation verify "hermes-ai-usage-$VERSION.tar.gz" \
  --repo masterlf/hermes-ai-usage
sha256sum --check SHA256SUMS
tar -xzf "hermes-ai-usage-$VERSION.tar.gz"
cd "hermes-ai-usage-$VERSION"
```

Back up only the existing plugin files and configuration, with restrictive permissions:

```bash
BACKUP="$HERMES_HOME/backups/ai-usage-monitor-$(date -u +%Y%m%dT%H%M%SZ)"
install -d -m 0700 "$BACKUP"
for path in \
  "$HERMES_HOME/plugins/ai-usage-monitor" \
  "$HERMES_HOME/desktop-plugins/ai-usage-monitor"
do
  if [ -e "$path" ]; then cp -a "$path" "$BACKUP/"; fi
done
if [ -f "$HERMES_HOME/config.yaml" ]; then
  cp -a "$HERMES_HOME/config.yaml" "$BACKUP/config.yaml"
fi
```

Install the verified files:

```bash
install -d "$HERMES_HOME/plugins/ai-usage-monitor/dashboard/dist"
install -d "$HERMES_HOME/desktop-plugins/ai-usage-monitor"
install -m 0644 runtime/dashboard/plugin_api.py "$HERMES_HOME/plugins/ai-usage-monitor/dashboard/"
install -m 0644 runtime/dashboard/manifest.json "$HERMES_HOME/plugins/ai-usage-monitor/dashboard/"
install -m 0644 runtime/dashboard/dist/index.js "$HERMES_HOME/plugins/ai-usage-monitor/dashboard/dist/"
install -m 0644 runtime/dashboard/dist/style.css "$HERMES_HOME/plugins/ai-usage-monitor/dashboard/dist/"
install -m 0644 desktop/plugin.js "$HERMES_HOME/desktop-plugins/ai-usage-monitor/"
```

Add `ai-usage-monitor` to the existing `plugins.enabled` list while preserving every
existing entry, then run `hermes config check`. Dashboard-only companions may not be
recognised by `hermes plugins enable`; that does not justify replacing the list. Restart
the backend/gateway and Dashboard from an external shell.

## Verify

1. Confirm `hermes config check` succeeds.
2. Open `/ai-usage` in the authenticated Dashboard and AI Usage in Desktop.
3. Confirm `/api/plugins/ai-usage-monitor/health` returns `ok: true` through the
   authenticated Dashboard session.
4. Confirm unsupported quota providers and unavailable history render as unavailable,
   never as zero.
5. Compare installed files with the extracted, checksum-verified release using
   `sha256sum` or `cmp`.
6. Confirm `state.db` remains unchanged using the deployment's backup/integrity process.

## Roll back

Stop the affected Hermes processes, remove only the two plugin directories, restore the
matching directories and `config.yaml` from `$BACKUP`, run `hermes config check`, verify
the restored files, and restart. Do not restore a backup from another profile home.

## Remove

Remove `ai-usage-monitor` from `plugins.enabled` while preserving other entries, delete
only `$HERMES_HOME/plugins/ai-usage-monitor/` and
`$HERMES_HOME/desktop-plugins/ai-usage-monitor/`, validate configuration, and restart.
The plugin creates no database or browser storage.
