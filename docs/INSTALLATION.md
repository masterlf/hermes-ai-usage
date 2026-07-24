# Installation and Operations

## Prerequisites

- a current Hermes Agent installation that includes the Desktop and Web Dashboard
  plugin SDKs plus `agent.account_usage`;
- filesystem access to the target Hermes home;
- an authenticated provider if account-quota windows are expected.

Back up `~/.hermes/config.yaml` before changing plugin enablement. Never commit that
backup or copy it into this repository.

## Install

```bash
git clone https://github.com/masterlf/hermes-ai-usage.git
cd hermes-ai-usage

install -d ~/.hermes/plugins/ai-usage-monitor/dashboard/dist
install -d ~/.hermes/desktop-plugins/ai-usage-monitor
install -m 0644 runtime/dashboard/plugin_api.py ~/.hermes/plugins/ai-usage-monitor/dashboard/
install -m 0644 runtime/dashboard/manifest.json ~/.hermes/plugins/ai-usage-monitor/dashboard/
install -m 0644 runtime/dashboard/dist/index.js ~/.hermes/plugins/ai-usage-monitor/dashboard/dist/
install -m 0644 runtime/dashboard/dist/style.css ~/.hermes/plugins/ai-usage-monitor/dashboard/dist/
install -m 0644 desktop/plugin.js ~/.hermes/desktop-plugins/ai-usage-monitor/
```

Add `ai-usage-monitor` to the existing `plugins.enabled` list in
`~/.hermes/config.yaml`. **Preserve all existing entries.** Dashboard-only companions
may not be recognised by `hermes plugins enable`; this does not justify replacing the
whole list.

Validate configuration:

```bash
hermes config check
```

Restart the Hermes backend/gateway and Dashboard from an external shell. A running
gateway may intentionally refuse to restart itself. The Dashboard manifest/API is
loaded at process start; the Desktop JS can hot-reload independently.

## Verify

1. Open the Web Dashboard and select **AI Usage**, or navigate to `/ai-usage`.
2. In Hermes Desktop, look for the **AI** status indicator or open **AI Usage**.
3. Confirm the health endpoint through the authenticated Dashboard session:
   `/api/plugins/ai-usage-monitor/health`.
4. Verify unsupported providers show `unavailable` rather than an estimated percentage.
5. Verify `state.db` remains unchanged using your normal backup/integrity procedure.

## Upgrade

Fetch a reviewed tag or commit, rerun the five `install` commands, validate config, and
restart the backend/Dashboard when `manifest.json` or `plugin_api.py` changed. Read the
changelog before upgrading.

## Remove

1. Remove `ai-usage-monitor` from `plugins.enabled` while preserving other entries.
2. Delete only these directories:
   - `~/.hermes/plugins/ai-usage-monitor/`
   - `~/.hermes/desktop-plugins/ai-usage-monitor/`
3. Run `hermes config check` and restart Hermes services.

The plugin creates no database or browser storage, so no plugin-owned usage data remains.
