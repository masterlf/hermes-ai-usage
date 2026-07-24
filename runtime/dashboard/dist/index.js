(function () {
  "use strict";

  const SDK = window.__HERMES_PLUGIN_SDK__;
  const registry = window.__HERMES_PLUGINS__;
  if (!SDK || !registry) return;

  const React = SDK.React;
  const h = React.createElement;

  function api(path) {
    return SDK.fetchJSON("/api/plugins/ai-usage-monitor" + path);
  }

  function text() {
    const locale = String(document.documentElement.lang || navigator.language || "en").toLowerCase();
    if (locale.startsWith("fr")) {
      return {
        kicker: "TÉLÉMÉTRIE FOURNISSEUR",
        title: "Consommation IA",
        subtitle: "Quota fournisseur, compteurs de tokens Hermes et historique récent — sans lire le contenu de tes prompts.",
        refresh: "Actualiser",
        refreshing: "Actualisation…",
        account: "Quota du compte",
        unavailable: "Le fournisseur ne publie pas de quota de compte exploitable.",
        remaining: "restants",
        used: "utilisés",
        reset: "Réinitialisation",
        stats: "Activité Hermes · 7 jours",
        sessions: "Sessions",
        calls: "Appels API",
        input: "Entrée",
        output: "Sortie",
        cached: "Cache lu",
        total: "Tokens bruts",
        recent: "Sessions récentes",
        recentHint: "30 dernières sessions de la période",
        date: "Date",
        model: "Modèle · fournisseur",
        surface: "Surface",
        tokens: "Tokens",
        empty: "Aucune consommation enregistrée sur cette période.",
        loading: "Chargement de la consommation…",
        error: "Impossible de charger les données de consommation. Réessaie dans quelques secondes.",
        codex: "Ce pourcentage représente le quota Codex rattaché à l’abonnement ChatGPT, pas un compteur universel de toutes les conversations ChatGPT.",
        source: "Les pourcentages viennent du fournisseur lorsqu’il les expose. Les tokens sont les compteurs enregistrés par Hermes ; ils ne se convertissent pas directement en pourcentage d’abonnement."
      };
    }
    return {
      kicker: "PROVIDER TELEMETRY",
      title: "AI Usage",
      subtitle: "Provider quota, Hermes token counters, and recent history — without reading prompt content.",
      refresh: "Refresh",
      refreshing: "Refreshing…",
      account: "Account quota",
      unavailable: "The provider does not publish a usable account quota.",
      remaining: "remaining",
      used: "used",
      reset: "Resets",
      stats: "Hermes activity · 7 days",
      sessions: "Sessions",
      calls: "API calls",
      input: "Input",
      output: "Output",
      cached: "Cache read",
      total: "Raw tokens",
      recent: "Recent sessions",
      recentHint: "Latest 30 sessions in the period",
      date: "Date",
      model: "Model · provider",
      surface: "Surface",
      tokens: "Tokens",
      empty: "No usage was recorded in this period.",
      loading: "Loading usage data…",
      error: "Usage data could not be loaded. Try again in a few seconds.",
      codex: "This percentage is the Codex allowance attached to the ChatGPT subscription, not a universal meter for all ChatGPT conversations.",
      source: "Percentages come from the provider when exposed. Tokens are counters recorded by Hermes; they do not convert directly into a subscription percentage."
    };
  }

  function compact(value) {
    const n = Number(value || 0);
    if (n >= 1000000000) return (n / 1000000000).toFixed(1) + "B";
    if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
    if (n >= 1000) return (n / 1000).toFixed(1) + "k";
    return n.toLocaleString();
  }

  function formatDate(value) {
    if (!value) return "—";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat(undefined, {
      dateStyle: "short",
      timeStyle: "short"
    }).format(date);
  }

  function bindingWindow(account) {
    const windows = (account && account.windows || []).filter(function (window) {
      return Number.isFinite(window.remaining_percent);
    });
    return windows.length ? windows.reduce(function (lowest, current) {
      return current.remaining_percent < lowest.remaining_percent ? current : lowest;
    }) : null;
  }

  function Stat(props) {
    return h("div", { className: "aum-stat" },
      h("div", { className: "aum-stat-label" }, props.label),
      h("div", { className: "aum-stat-value" }, props.value)
    );
  }

  function AccountCard(props) {
    const account = props.account;
    const t = props.t;
    if (!account || !account.available) {
      return h("section", { className: "aum-card" },
        h("h2", { className: "aum-card-title" }, t.account),
        h("p", { className: "aum-card-meta" }, t.unavailable)
      );
    }

    return h("section", { className: "aum-card" },
      h("h2", { className: "aum-card-title" }, t.account),
      h("p", { className: "aum-card-meta" }, account.provider + (account.plan ? " · " + account.plan : "")),
      h("div", { className: "aum-window-list" }, (account.windows || []).map(function (window, index) {
        const used = Math.max(0, Math.min(100, Number(window.used_percent || 0)));
        return h("div", { className: "aum-window", key: window.label + "-" + index },
          h("div", { className: "aum-window-head" },
            h("span", null, window.label),
            h("span", { className: "aum-window-value" }, Math.round(window.remaining_percent) + "% " + t.remaining)
          ),
          h("div", { className: "aum-progress" },
            h("div", { className: "aum-progress-fill", style: { width: used + "%" } })
          ),
          h("div", { className: "aum-window-foot" },
            Math.round(used) + "% " + t.used + (window.reset_at ? " · " + t.reset + " " + formatDate(window.reset_at) : "")
          )
        );
      })),
      account.details && account.details.length ? h("div", { className: "aum-details" }, account.details.join(" · ")) : null,
      account.provider === "openai-codex" ? h("p", { className: "aum-caveat" }, t.codex) : null
    );
  }

  function StatsCard(props) {
    const totals = props.history && props.history.totals || {};
    const t = props.t;
    return h("section", { className: "aum-card" },
      h("h2", { className: "aum-card-title" }, t.stats),
      h("p", { className: "aum-card-meta" }, t.source),
      h("div", { className: "aum-stats" },
        h(Stat, { label: t.sessions, value: compact(totals.sessions) }),
        h(Stat, { label: t.calls, value: compact(totals.api_calls) }),
        h(Stat, { label: t.input, value: compact(totals.input_tokens) }),
        h(Stat, { label: t.output, value: compact(totals.output_tokens) }),
        h(Stat, { label: t.cached, value: compact(totals.cache_read_tokens) }),
        h(Stat, { label: t.total, value: compact(totals.total_tokens) })
      )
    );
  }

  function HistoryTable(props) {
    const rows = props.history && props.history.rows || [];
    const t = props.t;
    return h("section", { className: "aum-card aum-table-card" },
      h("div", { className: "aum-table-head" },
        h("div", null,
          h("h2", { className: "aum-card-title" }, t.recent),
          h("p", { className: "aum-card-meta" }, t.recentHint)
        )
      ),
      rows.length ? h("div", { className: "aum-table-wrap" },
        h("table", { className: "aum-table" },
          h("thead", null, h("tr", null,
            h("th", null, t.date),
            h("th", null, t.model),
            h("th", null, t.surface),
            h("th", { className: "aum-num" }, t.calls),
            h("th", { className: "aum-num" }, t.tokens)
          )),
          h("tbody", null, rows.map(function (row, index) {
            return h("tr", { key: (row.ended_at || row.started_at || "session") + "-" + index },
              h("td", null, formatDate(row.ended_at || row.started_at)),
              h("td", { className: "aum-model" }, (row.model || "unknown") + " · " + (row.provider || "unknown")),
              h("td", { className: "aum-muted" }, row.source || "unknown"),
              h("td", { className: "aum-num" }, compact(row.api_call_count)),
              h("td", { className: "aum-num" }, compact(row.total_tokens))
            );
          }))
        )
      ) : h("div", { className: "aum-empty" }, t.empty)
    );
  }

  function AIUsagePage() {
    const t = text();
    const state = React.useState({ loading: true, refreshing: false, error: false, account: null, history: null });
    const data = state[0];
    const setData = state[1];

    const load = React.useCallback(function (manual) {
      setData(function (previous) { return Object.assign({}, previous, { refreshing: !!manual, error: false }); });
      return Promise.all([api("/snapshot?provider=auto"), api("/history?days=7&limit=30")])
        .then(function (responses) {
          setData({
            loading: false,
            refreshing: false,
            error: false,
            account: responses[0] && responses[0].account,
            history: responses[1] && responses[1].history
          });
        })
        .catch(function () {
          setData(function (previous) { return Object.assign({}, previous, { loading: false, refreshing: false, error: true }); });
        });
    }, []);

    React.useEffect(function () {
      load(false);
      const timer = window.setInterval(function () { load(false); }, 60000);
      return function () { window.clearInterval(timer); };
    }, [load]);

    if (data.loading) {
      return h("div", { className: "aum-page" }, h("div", { className: "aum-loading" }, t.loading));
    }

    const binding = bindingWindow(data.account);
    return h("div", { className: "aum-page" },
      h("header", { className: "aum-hero" },
        h("div", null,
          h("div", { className: "aum-kicker" }, t.kicker),
          h("h1", { className: "aum-title" }, t.title),
          h("p", { className: "aum-subtitle" }, t.subtitle)
        ),
        h("div", { className: "aum-hero-actions" },
          h("div", { className: "aum-binding" }, binding ? Math.round(binding.remaining_percent) + "% " + t.remaining : "—"),
          h("button", {
            type: "button",
            className: "aum-button",
            disabled: data.refreshing,
            onClick: function () { load(true); }
          }, data.refreshing ? t.refreshing : t.refresh)
        )
      ),
      data.error ? h("div", { className: "aum-error", role: "alert" }, t.error) : null,
      h("div", { className: "aum-grid" },
        h(AccountCard, { account: data.account, t: t }),
        h(StatsCard, { history: data.history, t: t })
      ),
      h(HistoryTable, { history: data.history, t: t }),
      h("p", { className: "aum-source-note" }, t.source)
    );
  }

  registry.register("ai-usage-monitor", AIUsagePage);
})();
