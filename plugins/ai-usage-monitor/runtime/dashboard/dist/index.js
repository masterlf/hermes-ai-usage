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
        stats: function (days) { return "Activité Hermes · " + (days === 1 ? "24 heures" : days + " jours"); },
        sessions: "Sessions",
        calls: "Appels API",
        input: "Entrée",
        output: "Sortie",
        cached: "Cache lu",
        total: "Tokens bruts",
        chart: "Utilisation des tokens",
        chartHint: "Créneaux UTC · clique sur une barre pour isoler les sessions correspondantes.",
        inputLegend: "Entrée",
        outputLegend: "Sortie",
        reasoningLegend: "Raisonnement (dans la sortie)",
        cacheReadLegend: "Cache lu",
        cacheWriteLegend: "Cache écrit",
        recent: "Sessions récentes",
        recentHint: "30 dernières sessions de la période",
        filteredHint: "Sessions du créneau sélectionné",
        truncatedHint: "Résultats bornés : certaines sessions du créneau ne sont pas affichées.",
        logRef: "Réf. logs",
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
      stats: function (days) { return "Hermes activity · " + (days === 1 ? "24 hours" : days + " days"); },
      sessions: "Sessions",
      calls: "API calls",
      input: "Input",
      output: "Output",
      cached: "Cache read",
      total: "Raw tokens",
      chart: "Token usage",
      chartHint: "UTC buckets · select a bar to isolate the matching sessions.",
      inputLegend: "Input",
      outputLegend: "Output",
      reasoningLegend: "Reasoning (within output)",
      cacheReadLegend: "Cache read",
      cacheWriteLegend: "Cache write",
      recent: "Recent sessions",
      recentHint: "Latest 30 sessions in the period",
      filteredHint: "Sessions in the selected bucket",
      truncatedHint: "Bounded results: some sessions in this bucket are not displayed.",
      logRef: "Log ref",
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
    const numeric = Number(value);
    const date = new Date(Number.isFinite(numeric) && Math.abs(numeric) < 100000000000 ? numeric * 1000 : value);
    return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat(undefined, {
      dateStyle: "short",
      timeStyle: "short"
    }).format(date);
  }

  function formatBucket(value, bucket) {
    const date = new Date(Number(value || 0) * 1000);
    if (Number.isNaN(date.getTime())) return "—";
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "short",
      timeStyle: bucket === "hour" ? "short" : undefined,
      timeZone: "UTC"
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
    const history = props.history || {};
    const totals = history.totals || {};
    const historyDays = Number(history.days);
    const scopeDays = Number.isInteger(historyDays) && historyDays >= 1 && historyDays <= 90
      ? historyDays
      : props.days;
    const t = props.t;
    return h("section", { className: "aum-card" },
      h("h2", { className: "aum-card-title" }, t.stats(scopeDays)),
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

  function UsageChart(props) {
    const history = props.history || {};
    const series = history.series || {};
    const points = series.points || [];
    const t = props.t;
    const width = Math.max(720, points.length * 22 + 64);
    const height = 220;
    const baseline = 182;
    const chartHeight = 142;
    const step = (width - 64) / Math.max(1, points.length);
    const barWidth = Math.max(4, Math.min(18, step * 0.68));
    const maximum = Math.max(1, ...points.map(function (point) { return Number(point.total_tokens || 0); }));
    const labelStep = Math.max(1, Math.ceil(points.length / 7));
    const legends = [
      ["input", t.inputLegend],
      ["output", t.outputLegend],
      ["reasoning", t.reasoningLegend],
      ["cache-read", t.cacheReadLegend],
      ["cache-write", t.cacheWriteLegend]
    ];

    return h("section", { className: "aum-card aum-chart-card" },
      h("div", { className: "aum-chart-head" },
        h("div", null,
          h("h2", { className: "aum-card-title" }, t.chart),
          h("p", { className: "aum-card-meta" }, t.chartHint)
        ),
        h("div", { className: "aum-periods", "aria-label": t.chart }, [1, 7, 30, 90].map(function (days) {
          return h("button", {
            type: "button",
            className: "aum-period" + (props.days === days ? " is-active" : ""),
            onClick: function () { props.onDays(days); },
            key: days
          }, days === 1 ? "24h" : days + "d");
        }))
      ),
      points.length ? h("div", { className: "aum-chart-scroll" },
        h("svg", {
          className: "aum-chart",
          viewBox: "0 0 " + width + " " + height,
          style: { width: width + "px" },
          role: "img",
          "aria-label": t.chart
        },
          h("line", { className: "aum-chart-axis", x1: 32, y1: baseline, x2: width - 24, y2: baseline }),
          points.map(function (point, index) {
            const reasoning = Math.min(Number(point.reasoning_tokens || 0), Number(point.output_tokens || 0));
            const segments = [
              ["input", Number(point.input_tokens || 0)],
              ["cache-read", Number(point.cache_read_tokens || 0)],
              ["cache-write", Number(point.cache_write_tokens || 0)],
              ["output", Math.max(0, Number(point.output_tokens || 0) - reasoning)],
              ["reasoning", reasoning]
            ];
            const x = 32 + index * step + (step - barWidth) / 2;
            let y = baseline;
            const rectangles = segments.map(function (segment) {
              const segmentHeight = Math.max(0, segment[1] / maximum * chartHeight);
              y -= segmentHeight;
              return h("rect", {
                className: "aum-chart-segment aum-chart-" + segment[0],
                x: x,
                y: y,
                width: barWidth,
                height: segmentHeight,
                key: segment[0]
              });
            });
            const label = formatBucket(point.bucket_start, series.bucket);
            const tooltip = label + " · " + compact(point.total_tokens) + " " + t.tokens
              + " · " + compact(point.sessions) + " " + t.sessions;
            const selected = props.selectedBucket === Number(point.bucket_start);
            return h("g", {
              className: "aum-chart-bar" + (selected ? " is-selected" : ""),
              role: "button",
              tabIndex: 0,
              "aria-label": tooltip,
              onClick: function () { props.onSelect(Number(point.bucket_start)); },
              onKeyDown: function (event) {
                if (event.key === "Enter" || event.key === " ") props.onSelect(Number(point.bucket_start));
              },
              key: point.bucket_start
            },
              h("title", null, tooltip),
              rectangles,
              index % labelStep === 0 || index === points.length - 1
                ? h("text", { className: "aum-chart-label", x: x + barWidth / 2, y: baseline + 22, textAnchor: "middle" }, label)
                : null
            );
          })
        )
      ) : h("div", { className: "aum-empty" }, t.empty),
      h("div", { className: "aum-chart-legend" }, legends.map(function (legend) {
        return h("span", { key: legend[0] },
          h("i", { className: "aum-legend-swatch aum-chart-" + legend[0] }),
          legend[1]
        );
      }))
    );
  }

  function HistoryTable(props) {
    const history = props.history || {};
    const rows = history.rows || [];
    const series = history.series || {};
    const bucketSeconds = Number(series.bucket_seconds || 86400);
    const visibleRows = props.selectedBucket === null
      ? rows.slice(0, 30)
      : rows.filter(function (row) {
        const eventTime = Number(row.ended_at || row.started_at || 0);
        return Math.floor(eventTime / bucketSeconds) * bucketSeconds === props.selectedBucket;
      });
    const t = props.t;
    return h("section", { className: "aum-card aum-table-card" },
      h("div", { className: "aum-table-head" },
        h("div", null,
          h("h2", { className: "aum-card-title" }, t.recent),
          h("p", { className: "aum-card-meta" }, props.selectedBucket === null ? t.recentHint : t.filteredHint),
          props.selectedBucket !== null && history.rows_truncated
            ? h("p", { className: "aum-warning" }, t.truncatedHint)
            : null
        )
      ),
      visibleRows.length ? h("div", { className: "aum-table-wrap" },
        h("table", { className: "aum-table" },
          h("thead", null, h("tr", null,
            h("th", null, t.date),
            h("th", null, t.model),
            h("th", null, t.surface),
            h("th", null, t.logRef),
            h("th", { className: "aum-num" }, t.calls),
            h("th", { className: "aum-num" }, t.tokens)
          )),
          h("tbody", null, visibleRows.map(function (row, index) {
            const tokenDetail = t.inputLegend + " " + compact(row.input_tokens)
              + " · " + t.outputLegend + " " + compact(row.output_tokens)
              + " · " + t.cacheReadLegend + " " + compact(row.cache_read_tokens)
              + " · " + t.cacheWriteLegend + " " + compact(row.cache_write_tokens)
              + (row.reasoning_tokens ? " · " + t.reasoningLegend + " " + compact(row.reasoning_tokens) : "");
            return h("tr", { key: row.session_ref || (row.ended_at || row.started_at || "session") + "-" + index },
              h("td", null, formatDate(row.ended_at || row.started_at)),
              h("td", { className: "aum-model" }, (row.model || "unknown") + " · " + (row.provider || "unknown")),
              h("td", { className: "aum-muted" }, row.source || "unknown"),
              h("td", null, row.session_ref ? h("code", { className: "aum-session-ref", title: t.logRef }, row.session_ref) : "—"),
              h("td", { className: "aum-num" }, compact(row.api_call_count)),
              h("td", { className: "aum-num", title: tokenDetail }, compact(row.total_tokens))
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
    const periodState = React.useState(7);
    const days = periodState[0];
    const setDays = periodState[1];
    const selectionState = React.useState(null);
    const selectedBucket = selectionState[0];
    const setSelectedBucket = selectionState[1];
    const requestGeneration = React.useRef(0);

    const load = React.useCallback(function (manual) {
      const generation = ++requestGeneration.current;
      setData(function (previous) { return Object.assign({}, previous, { refreshing: !!manual, error: false }); });
      const bucketQuery = selectedBucket === null ? "" : "&bucket_start=" + encodeURIComponent(String(selectedBucket));
      return Promise.all([api("/snapshot?provider=auto"), api("/history?days=" + days + "&limit=200" + bucketQuery)])
        .then(function (responses) {
          if (generation !== requestGeneration.current) return;
          setData({
            loading: false,
            refreshing: false,
            error: false,
            account: responses[0] && responses[0].account,
            history: responses[1] && responses[1].history
          });
        })
        .catch(function () {
          if (generation !== requestGeneration.current) return;
          setData(function (previous) { return Object.assign({}, previous, { loading: false, refreshing: false, error: true }); });
        });
    }, [days, selectedBucket]);

    React.useEffect(function () {
      load(false);
      const timer = window.setInterval(function () { load(false); }, 60000);
      return function () {
        window.clearInterval(timer);
        requestGeneration.current += 1;
      };
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
        h(StatsCard, { history: data.history, t: t, days: days })
      ),
      h(UsageChart, {
        history: data.history,
        t: t,
        days: days,
        selectedBucket: selectedBucket,
        onDays: function (value) {
          setSelectedBucket(null);
          setDays(value);
        },
        onSelect: function (value) {
          setSelectedBucket(function (current) { return current === value ? null : value; });
        }
      }),
      h(HistoryTable, { history: data.history, t: t, selectedBucket: selectedBucket }),
      h("p", { className: "aum-source-note" }, t.source)
    );
  }

  registry.register("ai-usage-monitor", AIUsagePage);
})();
