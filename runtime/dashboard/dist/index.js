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
        usageUnavailable: "Consommation indisponible",
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
        workload: "Charge",
        tokens: "Tokens",
        inProgress: "En cours",
        durationDays: function (days, hours) { return days + " j " + String(hours).padStart(2, "0") + " h"; },
        durationHours: function (hours, minutes) { return hours + " h " + String(minutes).padStart(2, "0") + " min"; },
        durationMinutes: function (minutes, seconds) { return minutes + " min " + String(seconds).padStart(2, "0") + " s"; },
        durationSeconds: function (seconds) { return seconds + " s"; },
        bands: { green: "Faible", blue: "Modérée", yellow: "Soutenue", orange: "Élevée", red: "Extrême" },
        surfaces: { cron: "Cron", desktop: "Desktop", cli: "CLI", tui: "TUI", acp: "ACP", gateway: "Passerelle", other: "Autre" },
        workloads: { scheduled: "Planifiée", subagent: "Sous-agent", branch: "Branche", continuation: "Continuation" },
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
      usageUnavailable: "Usage unavailable",
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
      workload: "Workload",
      tokens: "Tokens",
      inProgress: "In progress",
      durationDays: function (days, hours) { return days + "d " + String(hours).padStart(2, "0") + "h"; },
      durationHours: function (hours, minutes) { return hours + "h " + String(minutes).padStart(2, "0") + "m"; },
      durationMinutes: function (minutes, seconds) { return minutes + "m " + String(seconds).padStart(2, "0") + "s"; },
      durationSeconds: function (seconds) { return seconds + "s"; },
      bands: { green: "Low", blue: "Moderate", yellow: "Elevated", orange: "High", red: "Extreme" },
      surfaces: { cron: "Cron", desktop: "Desktop", cli: "CLI", tui: "TUI", acp: "ACP", gateway: "Gateway", other: "Other" },
      workloads: { scheduled: "Scheduled", subagent: "Subagent", branch: "Branch", continuation: "Continuation" },
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
      return quotaPercentages(window).used !== null;
    });
    return windows.length ? windows.reduce(function (lowest, current) {
      return quotaPercentages(current).remaining < quotaPercentages(lowest).remaining ? current : lowest;
    }) : null;
  }

  function quotaPercentages(window) {
    const usedValue = Number(window && window.used_percent);
    const remainingValue = Number(window && window.remaining_percent);
    const used = window && window.used_percent !== null && Number.isFinite(usedValue)
      ? Math.max(0, Math.min(100, usedValue))
      : window && window.remaining_percent !== null && Number.isFinite(remainingValue)
        ? 100 - Math.max(0, Math.min(100, remainingValue))
        : null;
    return { used: used, remaining: used === null ? null : 100 - used };
  }

  function tokenBand(value, t) {
    const total = Number(value);
    if (!Number.isFinite(total) || total < 0) return null;
    const key = total < 10000 ? "green" : total < 50000 ? "blue" : total < 100000 ? "yellow" : total < 250000 ? "orange" : "red";
    return { key: key, label: t.bands[key] };
  }

  function formatDuration(value, active, t) {
    if (active) return t.inProgress;
    if (!Number.isInteger(value) || value < 0) return "—";
    const days = Math.floor(value / 86400);
    const hours = Math.floor(value % 86400 / 3600);
    const minutes = Math.floor(value % 3600 / 60);
    const seconds = value % 60;
    if (days) return t.durationDays(days, hours);
    if (hours) return t.durationHours(hours, minutes);
    if (minutes) return t.durationMinutes(minutes, seconds);
    return t.durationSeconds(seconds);
  }

  function workloadLabel(row, t) {
    const surface = t.surfaces[row.surface || row.source] || t.surfaces.other;
    const workload = row.workload_type && !["interactive", "unknown"].includes(row.workload_type)
      ? t.workloads[row.workload_type]
      : null;
    return [surface, workload, row.profile].filter(Boolean).join(" · ");
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
        const quota = quotaPercentages(window);
        const visualWidth = quota.used > 0 && quota.used < 1 ? "2px" : quota.used + "%";
        return h("div", { className: "aum-window", key: window.label + "-" + index },
          h("div", { className: "aum-window-head" },
            h("span", null, window.label),
            h("span", { className: "aum-window-value" }, quota.remaining === null ? t.usageUnavailable : Math.round(quota.remaining) + "% " + t.remaining)
          ),
          quota.used === null
            ? h("div", { className: "aum-progress is-unavailable", role: "status" }, t.usageUnavailable)
            : h("div", {
                className: "aum-progress" + (quota.used >= 90 ? " is-danger" : ""),
                role: "progressbar",
                "aria-label": window.label + ": " + quota.used + "% " + t.used,
                "aria-valuemin": 0,
                "aria-valuemax": 100,
                "aria-valuenow": quota.used
              }, h("div", { className: "aum-progress-fill", style: { width: visualWidth } })),
          h("div", { className: "aum-window-foot" },
            quota.used === null ? t.usageUnavailable : quota.used + "% " + t.used + (window.reset_at ? " · " + t.reset + " " + formatDate(window.reset_at) : "")
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
    const viewportRef = React.useRef(null);
    const widthState = React.useState(320);
    const viewportWidth = widthState[0];
    const setViewportWidth = widthState[1];
    React.useEffect(function () {
      const viewport = viewportRef.current;
      if (!viewport) return undefined;
      const measure = function () { setViewportWidth(Math.max(0, viewport.clientWidth || 0)); };
      measure();
      if (typeof ResizeObserver === "undefined") return undefined;
      const observer = new ResizeObserver(measure);
      observer.observe(viewport);
      return function () { observer.disconnect(); };
    }, []);
    const left = 40;
    const right = 16;
    const width = Math.max(viewportWidth, left + right + points.length * 10);
    const height = 220;
    const baseline = 182;
    const chartHeight = 142;
    const step = (width - left - right) / Math.max(1, points.length);
    const barWidth = Math.max(3, Math.min(18, step * 0.66));
    const maximum = Math.max(1, ...points.map(function (point) { return Number(point.total_tokens || 0); }));
    const periodCadence = props.days === 1 ? 4 : props.days === 7 ? 1 : props.days === 30 ? 5 : 14;
    const labelStep = Math.max(periodCadence, Math.ceil(72 / step));
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
      points.length ? h("div", { className: "aum-chart-scroll", ref: viewportRef },
        h("svg", {
          className: "aum-chart",
          viewBox: "0 0 " + width + " " + height,
          style: { width: width + "px" },
          role: "group",
          "aria-label": t.chart
        },
          h("line", { className: "aum-chart-axis", x1: left, y1: baseline, x2: width - right, y2: baseline }),
          h("line", { className: "aum-chart-axis", x1: left, y1: baseline - chartHeight / 2, x2: width - right, y2: baseline - chartHeight / 2 }),
          h("line", { className: "aum-chart-axis", x1: left, y1: baseline - chartHeight, x2: width - right, y2: baseline - chartHeight }),
          points.map(function (point, index) {
            const reasoning = Math.min(Number(point.reasoning_tokens || 0), Number(point.output_tokens || 0));
            const segments = [
              ["input", Number(point.input_tokens || 0)],
              ["cache-read", Number(point.cache_read_tokens || 0)],
              ["cache-write", Number(point.cache_write_tokens || 0)],
              ["output", Math.max(0, Number(point.output_tokens || 0) - reasoning)],
              ["reasoning", reasoning]
            ];
            const x = left + index * step + (step - barWidth) / 2;
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
            const tooltip = label + " UTC · " + Number(point.total_tokens || 0).toLocaleString() + " " + t.tokens
              + " · " + t.inputLegend + " " + compact(point.input_tokens)
              + " · " + t.outputLegend + " " + compact(point.output_tokens)
              + " · " + t.cacheReadLegend + " " + compact(point.cache_read_tokens)
              + " · " + t.cacheWriteLegend + " " + compact(point.cache_write_tokens)
              + " · " + t.reasoningLegend + " " + compact(point.reasoning_tokens)
              + " · " + compact(point.sessions) + " " + t.sessions
              + " · " + compact(point.api_calls) + " " + t.calls;
            const selected = props.selectedBucket === Number(point.bucket_start);
            return h("g", {
              className: "aum-chart-bar" + (selected ? " is-selected" : ""),
              role: "button",
              tabIndex: 0,
              "aria-label": tooltip,
              "aria-pressed": selected,
              onClick: function () { props.onSelect(Number(point.bucket_start)); },
              onKeyDown: function (event) {
                if (event.key === " ") event.preventDefault();
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
          }),
          h("text", { className: "aum-chart-label", x: width - right, y: 216, textAnchor: "end" }, "UTC")
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
            h("th", null, t.workload),
            h("th", null, t.model),
            h("th", { className: "aum-num" }, t.calls),
            h("th", { className: "aum-num" }, t.tokens),
            h("th", null, t.logRef)
          )),
          h("tbody", null, visibleRows.map(function (row, index) {
            const band = tokenBand(row.total_tokens, t);
            const tokenDetail = t.inputLegend + " " + compact(row.input_tokens)
              + " · " + t.outputLegend + " " + compact(row.output_tokens)
              + " · " + t.cacheReadLegend + " " + compact(row.cache_read_tokens)
              + " · " + t.cacheWriteLegend + " " + compact(row.cache_write_tokens)
              + (row.reasoning_tokens ? " · " + t.reasoningLegend + " " + compact(row.reasoning_tokens) : "");
            return h("tr", { key: row.session_ref || (row.ended_at || row.started_at || "session") + "-" + index },
              h("td", { "data-label": t.date }, formatDate(row.ended_at || row.started_at), h("small", { className: "aum-duration" }, formatDuration(row.duration_seconds, row.is_active, t))),
              h("td", { className: "aum-muted", "data-label": t.workload }, workloadLabel(row, t)),
              h("td", { className: "aum-model", "data-label": t.model }, (row.model || "unknown") + " · " + (row.provider || "unknown")),
              h("td", { className: "aum-num", "data-label": t.calls }, compact(row.api_call_count)),
              h("td", {
                className: "aum-num aum-band-" + (band ? band.key : "none"),
                title: tokenDetail,
                "aria-label": band ? Number(row.total_tokens).toLocaleString() + " " + t.tokens + ", " + band.label : t.usageUnavailable,
                "data-label": t.tokens
              }, band ? compact(row.total_tokens) + " · " + band.label : "—"),
              h("td", { "data-label": t.logRef }, row.session_ref ? h("code", { className: "aum-session-ref", title: t.logRef }, row.session_ref) : "—")
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
    const bindingQuota = quotaPercentages(binding);
    return h("div", { className: "aum-page" },
      h("header", { className: "aum-hero" },
        h("div", null,
          h("div", { className: "aum-kicker" }, t.kicker),
          h("h1", { className: "aum-title" }, t.title),
          h("p", { className: "aum-subtitle" }, t.subtitle)
        ),
        h("div", { className: "aum-hero-actions" },
          h("div", { className: "aum-binding" }, bindingQuota.remaining === null ? "—" : Math.round(bindingQuota.remaining) + "% " + t.remaining),
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
